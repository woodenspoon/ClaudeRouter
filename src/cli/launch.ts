import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { loadConfig } from '../router/config';
import type { BedrockContext } from '../router/config';

const MANAGED_ENV_KEYS = ['CLAUDE_CODE_USE_BEDROCK', 'AWS_REGION', 'ANTHROPIC_MODEL'];

function setTerminalTitle(title: string): void {
  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
}

function commandExists(name: string): boolean {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [name], { stdio: 'pipe' });
  return r.status === 0;
}

function settingsLocalPath(): string {
  return path.join(process.cwd(), '.claude', 'settings.local.json');
}

function readSettingsLocal(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(settingsLocalPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettingsLocal(data: Record<string, any>): void {
  const filePath = settingsLocalPath();
  if (Object.keys(data).length === 0) {
    try { fs.unlinkSync(filePath); } catch { /* already gone */ }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function removeBedrockKeys(settings: Record<string, any>): Record<string, any> {
  const result = { ...settings };
  if (result.env && typeof result.env === 'object') {
    result.env = { ...result.env };
    for (const key of MANAGED_ENV_KEYS) delete result.env[key];
    if (Object.keys(result.env).length === 0) delete result.env;
  }
  return result;
}

function resolveArns(
  ctx: BedrockContext,
  contextName: string
): { haiku: string; sonnet: string; high: string } {
  const haiku = ctx.haiku_arn;

  let sonnet: string;
  if (ctx.sonnet_arn) {
    sonnet = ctx.sonnet_arn;
  } else {
    process.stderr.write(
      `[claude-router] Warning: no sonnet_arn for context "${contextName}" — MEDIUM tier will use haiku_arn\n`
    );
    sonnet = haiku;
  }

  let high: string;
  if (ctx.fable_arn) {
    high = ctx.fable_arn;
  } else if (ctx.opus_arn) {
    high = ctx.opus_arn;
  } else {
    process.stderr.write(
      `[claude-router] Warning: no opus_arn for context "${contextName}" — HIGH tier will use sonnet_arn\n`
    );
    high = sonnet;
  }

  return { haiku, sonnet, high };
}

export function handleLaunch(args: string[]): void {
  const isDirect = args.includes('--direct');
  const isBedrock = args.includes('--bedrock');
  const bypassPermissions = args.includes('--bypass-permissions');

  const contextIdx = args.indexOf('--context');
  const contextName = contextIdx !== -1 ? args[contextIdx + 1] : undefined;

  const passthroughIdx = args.indexOf('--');
  const passthroughArgs = passthroughIdx !== -1 ? args.slice(passthroughIdx + 1) : [];

  if (!isDirect && !isBedrock) {
    process.stderr.write('Usage: claude-router launch --direct | --bedrock --context <name> [-- <claude-args>]\n');
    process.exit(1);
  }
  if (isDirect && isBedrock) {
    process.stderr.write('Error: --direct and --bedrock are mutually exclusive\n');
    process.exit(1);
  }

  // Bedrock mode requires @anthropic-ai/bedrock-sdk — verify before doing anything else
  if (isBedrock) {
    try {
      require('@anthropic-ai/bedrock-sdk');
    } catch {
      process.stderr.write(
        'Error: @anthropic-ai/bedrock-sdk is required for Bedrock mode but is not installed.\n' +
        'Install it with: npm install @anthropic-ai/bedrock-sdk\n'
      );
      process.exit(1);
    }
  }

  // Resolve claude binary cross-platform
  const claudeBin = commandExists('claude.exe') ? 'claude.exe' : 'claude';
  if (!commandExists(claudeBin) && !commandExists('claude')) {
    const hint = process.platform === 'win32'
      ? 'winget install -e --id Anthropic.ClaudeCode'
      : 'npm install -g @anthropic-ai/claude-code';
    process.stderr.write(`claude not found. Install with: ${hint}\n`);
    process.exit(1);
  }

  const claudeArgs = [...passthroughArgs];
  if (bypassPermissions) claudeArgs.push('--permission-mode', 'bypassPermissions');

  if (isDirect) {
    const updated = removeBedrockKeys(readSettingsLocal());
    writeSettingsLocal(updated);

    claudeArgs.push('--name', 'claude-api');
    setTerminalTitle('claude-api');
    const result = spawnSync(claudeBin, claudeArgs, { stdio: 'inherit' });
    process.exit(result.status ?? 0);
  }

  // Bedrock mode
  if (!contextName) {
    process.stderr.write('Error: --bedrock requires --context <name>\n');
    process.exit(1);
  }

  if (!commandExists('aws')) {
    const hint = process.platform === 'win32'
      ? 'winget install -e --id Amazon.AWSCLI'
      : 'https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html';
    process.stderr.write(`aws not found. Install from: ${hint}\n`);
    process.exit(1);
  }

  // AWS auth check
  const authCheck = spawnSync('aws', ['sts', 'get-caller-identity'], { stdio: 'pipe' });
  if (authCheck.status !== 0) {
    console.log('AWS session expired — running sso login...');
    const login = spawnSync('aws', ['sso', 'login'], { stdio: 'inherit' });
    if (login.status !== 0) {
      process.stderr.write('AWS login failed\n');
      process.exit(1);
    }
  }

  // Load context from config
  const config = loadConfig();
  const ctx = config.bedrock_contexts[contextName];
  if (!ctx) {
    const available = Object.keys(config.bedrock_contexts);
    process.stderr.write(`Error: context "${contextName}" not found in ~/.claude-router.json\n`);
    if (available.length > 0) {
      process.stderr.write(`Available contexts: ${available.join(', ')}\n`);
    } else {
      process.stderr.write(`No bedrock_contexts defined in ~/.claude-router.json\n`);
    }
    process.exit(1);
  }

  const { haiku, sonnet, high } = resolveArns(ctx, contextName);
  const region = ctx.region ?? 'us-east-1';

  // Patch settings.local.json (merge, preserve other operator keys)
  const settings = readSettingsLocal();
  if (!settings.env || typeof settings.env !== 'object') settings.env = {};
  settings.env.CLAUDE_CODE_USE_BEDROCK = '1';
  settings.env.AWS_REGION = region;
  settings.env.ANTHROPIC_MODEL = haiku;
  writeSettingsLocal(settings);

  // Build env for the claude child process
  const extraEnv: Record<string, string> = {
    CLAUDE_CONTEXT: contextName,
    CLAUDE_HAIKU_ARN: haiku,
    CLAUDE_SONNET_ARN: sonnet,
  };
  if (ctx.opus_arn) extraEnv.CLAUDE_OPUS_ARN = ctx.opus_arn;
  if (ctx.fable_arn) extraEnv.CLAUDE_FABLE_ARN = ctx.fable_arn;

  claudeArgs.push('--name', contextName);
  setTerminalTitle(contextName);
  const result = spawnSync(claudeBin, claudeArgs, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  process.exit(result.status ?? 0);
}
