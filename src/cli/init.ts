import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

function checkJq(): boolean {
  try {
    execSync('command -v jq', { stdio: 'pipe' });
    console.log('  ✓ jq found');
    return true;
  } catch {
    process.stderr.write('  ✗ jq not found — install jq (https://jqlang.github.io/jq/)\n');
    return false;
  }
}


function getSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function readJsonFile(filePath: string): Record<string, any> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function writeJsonFile(filePath: string, data: Record<string, any>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getHookPath(): string {
  return path.resolve(__dirname, '..', '..', 'hooks', 'user-prompt-submit.sh');
}

function getRuntimeClaudeMdPath(): string {
  return path.resolve(__dirname, '..', '..', 'runtime-claude.md');
}

export function handleInit(args: string[]): void {
  try {
    console.log('ClaudeRouter init\n');

    // 1. Check dependencies
    console.log('Checking dependencies:');
    const hasJq = checkJq();

    if (!hasJq) {
      process.stderr.write('\nMissing required dependency. Install jq and try again.\n');
      process.exit(1);
    }

    console.log('');

    // 2. Register the hook
    const settingsPath = getSettingsPath();
    const hookPath = getHookPath();

    if (!fs.existsSync(hookPath)) {
      process.stderr.write(`Hook script not found at ${hookPath}\n`);
      process.exit(1);
    }

    // Make the hook executable
    try {
      fs.chmodSync(hookPath, 0o755);
    } catch (err: any) {
      process.stderr.write(`Warning: could not make hook executable: ${err.message}\n`);
    }

    const settings = readJsonFile(settingsPath);

    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!Array.isArray(settings.hooks.UserPromptSubmit)) {
      settings.hooks.UserPromptSubmit = [];
    }

    const alreadyRegistered = settings.hooks.UserPromptSubmit.some(
      (entry: any) => typeof entry === 'object' && entry.command && entry.command.includes('claude-router')
    );

    if (alreadyRegistered) {
      console.log('Hook already registered in ~/.claude/settings.json');
    } else {
      settings.hooks.UserPromptSubmit.push({
        type: 'command',
        command: hookPath,
      });
      writeJsonFile(settingsPath, settings);
      console.log('Registered UserPromptSubmit hook in ~/.claude/settings.json');
    }

    // 3. Inject CLAUDE.md directives
    const targetDir = args[0] || process.cwd();
    const targetClaudeMd = path.join(targetDir, 'CLAUDE.md');
    const runtimePath = getRuntimeClaudeMdPath();

    if (!fs.existsSync(runtimePath)) {
      process.stderr.write(`Runtime CLAUDE.md not found at ${runtimePath}\n`);
      process.exit(1);
    }

    const routerContent = fs.readFileSync(runtimePath, 'utf-8');

    if (fs.existsSync(targetClaudeMd)) {
      let existing = fs.readFileSync(targetClaudeMd, 'utf-8');
      if (existing.includes('<!-- claude-router:start -->')) {
        // Replace existing block (idempotent update)
        existing = existing.replace(
          /<!-- claude-router:start -->[\s\S]*?<!-- claude-router:end -->/,
          routerContent.trim()
        );
        fs.writeFileSync(targetClaudeMd, existing, 'utf-8');
        console.log(`Updated router directives in ${targetClaudeMd}`);
      } else {
        // Append
        const separator = existing.endsWith('\n') ? '\n' : '\n\n';
        fs.writeFileSync(targetClaudeMd, existing + separator + routerContent, 'utf-8');
        console.log(`Appended router directives to ${targetClaudeMd}`);
      }
    } else {
      fs.writeFileSync(targetClaudeMd, routerContent, 'utf-8');
      console.log(`Created ${targetClaudeMd} with router directives`);
    }

    console.log('\nDone! ClaudeRouter is ready.');
  } catch (err: any) {
    process.stderr.write(`Error during init: ${err.message}\n`);
    process.exit(1);
  }
}

export function handleRemove(args: string[]): void {
  try {
    console.log('ClaudeRouter remove\n');

    // 1. Remove the hook from settings.json
    const settingsPath = getSettingsPath();

    if (fs.existsSync(settingsPath)) {
      const settings = readJsonFile(settingsPath);

      if (settings.hooks && Array.isArray(settings.hooks.UserPromptSubmit)) {
        settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
          (entry: any) => !(typeof entry === 'object' && entry.command && entry.command.includes('claude-router'))
        );

        if (settings.hooks.UserPromptSubmit.length === 0) {
          delete settings.hooks.UserPromptSubmit;
        }
        if (settings.hooks && Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }

        writeJsonFile(settingsPath, settings);
        console.log('Removed hook from ~/.claude/settings.json');
      } else {
        console.log('No hook found in ~/.claude/settings.json');
      }
    } else {
      console.log('No ~/.claude/settings.json found');
    }

    // 2. Remove CLAUDE.md section
    const targetDir = args[0] || process.cwd();
    const targetClaudeMd = path.join(targetDir, 'CLAUDE.md');

    if (fs.existsSync(targetClaudeMd)) {
      let content = fs.readFileSync(targetClaudeMd, 'utf-8');

      if (content.includes('<!-- claude-router:start -->')) {
        // Remove the block and any trailing blank line
        content = content.replace(
          /<!-- claude-router:start -->[\s\S]*?<!-- claude-router:end -->\n?/,
          ''
        );

        if (content.trim().length === 0) {
          fs.unlinkSync(targetClaudeMd);
          console.log(`Deleted empty ${targetClaudeMd}`);
        } else {
          fs.writeFileSync(targetClaudeMd, content, 'utf-8');
          console.log(`Removed router directives from ${targetClaudeMd}`);
        }
      } else {
        console.log(`No router directives found in ${targetClaudeMd}`);
      }
    } else {
      console.log(`No CLAUDE.md found at ${targetDir}`);
    }

    console.log('\nDone! ClaudeRouter has been removed.');
  } catch (err: any) {
    process.stderr.write(`Error during remove: ${err.message}\n`);
    process.exit(1);
  }
}
