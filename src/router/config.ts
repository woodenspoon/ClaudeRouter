import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface BedrockContext {
  region?: string;
  haiku_arn: string;
  sonnet_arn?: string | null;
  opus_arn?: string | null;
  fable_arn?: string | null;
}

export interface RouterConfig {
  provider: 'anthropic' | 'bedrock';
  tiers: {
    LOW: string;
    MEDIUM: string;
    HIGH: string;
  };
  fallback: string;
  conservative: boolean;
  override_keyword: string;
  bedrock_contexts: Record<string, BedrockContext>;
}

const DEFAULTS: RouterConfig = {
  provider: 'anthropic',
  tiers: {
    LOW: 'claude-haiku-4-5-20251001',
    MEDIUM: 'claude-sonnet-4-6',
    HIGH: 'claude-opus-4-8',
  },
  fallback: 'claude-sonnet-4-6',
  conservative: false,
  override_keyword: '//opus',
  bedrock_contexts: {},
};

function readJsonFile(filePath: string): Partial<RouterConfig> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Partial<RouterConfig>;
  } catch {
    return null;
  }
}

function deepMerge(base: RouterConfig, override: Partial<RouterConfig>): RouterConfig {
  const result: RouterConfig = { ...base, tiers: { ...base.tiers } };

  if (override.provider !== undefined) result.provider = override.provider;
  if (override.tiers) result.tiers = { ...base.tiers, ...override.tiers };
  if (override.fallback !== undefined) result.fallback = override.fallback;
  if (override.conservative !== undefined) result.conservative = override.conservative;
  if (override.override_keyword !== undefined) result.override_keyword = override.override_keyword;
  if (override.bedrock_contexts) {
    result.bedrock_contexts = { ...base.bedrock_contexts, ...override.bedrock_contexts };
  }

  return result;
}

export function loadConfig(cwd?: string): RouterConfig {
  let config: RouterConfig = deepMerge(DEFAULTS, {});

  const globalPath = path.join(os.homedir(), '.claude-router.json');
  const globalConfig = readJsonFile(globalPath);
  if (globalConfig) config = deepMerge(config, globalConfig);

  const localPath = path.join(cwd ?? process.cwd(), '.claude-router.json');
  const localConfig = readJsonFile(localPath);
  if (localConfig) config = deepMerge(config, localConfig);

  // Auto-detect Bedrock from env vars
  const bedrockEnv = process.env.CLAUDE_CODE_USE_BEDROCK === '1';
  const hasArnVars = !!(process.env.CLAUDE_HAIKU_ARN && process.env.CLAUDE_SONNET_ARN);
  if (bedrockEnv || hasArnVars) config.provider = 'bedrock';

  // When Bedrock, override tiers from env vars if present
  if (config.provider === 'bedrock') {
    const haiku = process.env.CLAUDE_HAIKU_ARN;
    const sonnet = process.env.CLAUDE_SONNET_ARN;
    // HIGH tier resolves: fable → opus → sonnet → haiku
    const high =
      process.env.CLAUDE_FABLE_ARN ||
      process.env.CLAUDE_OPUS_ARN ||
      sonnet ||
      haiku;

    if (haiku) config.tiers.LOW = haiku;
    if (sonnet) config.tiers.MEDIUM = sonnet;
    if (high) config.tiers.HIGH = high;
    if (haiku) config.fallback = sonnet ?? haiku;
  }

  warnInvalidModels(config);

  if (config.override_keyword.trim() === '') {
    process.stderr.write(
      `[claude-router] Warning: override_keyword is empty, resetting to default "${DEFAULTS.override_keyword}"\n`
    );
    config.override_keyword = DEFAULTS.override_keyword;
  }

  return config;
}

// Accepts model strings (claude-*) and Bedrock ARNs (arn:aws:bedrock:*)
const KNOWN_MODEL_PATTERN = /^claude-(haiku|sonnet|opus|fable)-|^arn:aws:bedrock:/;

function warnInvalidModels(config: RouterConfig): void {
  if (config.provider === 'bedrock') return;
  for (const [tier, model] of Object.entries(config.tiers)) {
    if (!KNOWN_MODEL_PATTERN.test(model)) {
      process.stderr.write(
        `[claude-router] Warning: model "${model}" for tier ${tier} may be invalid\n`
      );
    }
  }
}
