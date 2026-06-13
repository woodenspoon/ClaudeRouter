import { classify } from '../classifier/classifier';
import type { RouterConfig } from './config';
import type { Tier } from '../classifier/signals';

function shiftUp(tier: Tier): Tier {
  if (tier === 'LOW') return 'MEDIUM';
  if (tier === 'MEDIUM') return 'HIGH';
  return 'HIGH';
}

export interface RoutingDecision {
  model: string;
  tier: Tier;
  source: 'signal' | 'haiku' | 'fallback' | 'override';
  original_prompt: string;
  stripped_prompt: string;
  directive: string;
  latency_ms: number;
}

const DIRECTIVES: Record<Tier, string> = {
  LOW: '[ROUTER] Complexity: LOW. Delegate this entire task to a Haiku subagent via the Agent tool and return its response verbatim. Do not add commentary.',
  MEDIUM: '[ROUTER] Complexity: MEDIUM. Delegate this entire task to a Sonnet subagent via the Agent tool and return its response verbatim. Do not add commentary.',
  HIGH: '[ROUTER] Complexity: HIGH. Handle this task directly with full reasoning.',
};

const OVERRIDE_DIRECTIVE = '[ROUTER] User explicitly requested Opus. Handle this task directly.';

export async function route(prompt: string, config: RouterConfig): Promise<RoutingDecision> {
  const start = Date.now();
  const keyword = config.override_keyword.toLowerCase();
  const trimmed = prompt.trimStart();

  // Check for override keyword
  const afterKeyword = trimmed.slice(keyword.length);
  if (keyword.length > 0 && trimmed.toLowerCase().startsWith(keyword) && (afterKeyword === '' || /^\s/.test(afterKeyword))) {
    const stripped = afterKeyword.trimStart();
    return {
      model: config.tiers.HIGH,
      tier: 'HIGH',
      source: 'override',
      original_prompt: prompt,
      stripped_prompt: stripped,
      directive: OVERRIDE_DIRECTIVE,
      latency_ms: Date.now() - start,
    };
  }

  // Classify the prompt
  const classification = await classify(prompt);

  // Determine effective tier for directive (may differ from classification if conservative)
  const effectiveTier = config.conservative ? shiftUp(classification.tier) : classification.tier;
  const model = config.tiers[effectiveTier] ?? config.fallback;
  const directive = DIRECTIVES[effectiveTier];

  return {
    model,
    tier: classification.tier,
    source: classification.source,
    original_prompt: prompt,
    stripped_prompt: prompt,
    directive,
    latency_ms: Date.now() - start,
  };
}
