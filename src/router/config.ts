import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface RouterConfig {
  tiers: {
    LOW: string;
    MEDIUM: string;
    HIGH: string;
  };
  fallback: string;
  conservative: boolean;
  override_keyword: string;
}

const DEFAULTS: RouterConfig = {
  tiers: {
    LOW: 'claude-haiku-4-5-20251001',
    MEDIUM: 'claude-sonnet-4-6',
    HIGH: 'claude-opus-4-6',
  },
  fallback: 'claude-sonnet-4-6',
  conservative: false,
  override_keyword: '//opus',
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
  const result: RouterConfig = { ...base };

  if (override.tiers) {
    result.tiers = { ...base.tiers, ...override.tiers };
  }
  if (override.fallback !== undefined) {
    result.fallback = override.fallback;
  }
  if (override.conservative !== undefined) {
    result.conservative = override.conservative;
  }
  if (override.override_keyword !== undefined) {
    result.override_keyword = override.override_keyword;
  }

  return result;
}

export function loadConfig(cwd?: string): RouterConfig {
  let config: RouterConfig = { ...DEFAULTS, tiers: { ...DEFAULTS.tiers } };

  // Layer 1: ~/.claude-router.json
  const globalPath = path.join(os.homedir(), '.claude-router.json');
  const globalConfig = readJsonFile(globalPath);
  if (globalConfig) {
    config = deepMerge(config, globalConfig);
  }

  // Layer 2: .claude-router.json in CWD
  const localPath = path.join(cwd ?? process.cwd(), '.claude-router.json');
  const localConfig = readJsonFile(localPath);
  if (localConfig) {
    config = deepMerge(config, localConfig);
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

const KNOWN_MODEL_PATTERN = /^claude-(haiku|sonnet|opus)-/;

function warnInvalidModels(config: RouterConfig): void {
  for (const [tier, model] of Object.entries(config.tiers)) {
    if (!KNOWN_MODEL_PATTERN.test(model)) {
      process.stderr.write(
        `[claude-router] Warning: model "${model}" for tier ${tier} may be invalid\n`
      );
    }
  }
}
