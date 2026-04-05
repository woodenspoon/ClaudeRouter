export type Tier = 'LOW' | 'MEDIUM' | 'HIGH';

const CONFIRMATION_PATTERN =
  /^(yes|no|y|n|ok|okay|sure|go ahead|do it|proceed|continue|confirmed|sounds good|looks good|lgtm)\.?$/i;

const LOW_PREFIX_PATTERNS = [
  /^what does\b/i,
  /^what is\b/i,
  /^where is\b/i,
  /^show me\b/i,
  /^list\b/i,
  /^print\b/i,
  /^run\b/i,
  /^execute\b/i,
];

const COMPLETION_PREFIXES = [/^✓/i, /^done\b/i, /^complete\b/i, /^finished\b/i];

const HIGH_KEYWORD_PATTERNS = [
  /\barchitect\b/i,
  /\bredesign\b/i,
  /\btradeoffs?\b/i,
  /\bsecurity review\b/i,
  /\bperformance review\b/i,
  /\brefactor the entire\b/i,
  /\bfrom scratch\b/i,
];

const CONTEXT_REF =
  /\b(it|this|that|them|they|the error|the bug|the issue|the file|the function|the test|we|our|my|above|below|previous|earlier|last)\b/i;

const LOW_TOKEN_THRESHOLD = 8;
const HIGH_TOKEN_THRESHOLD = 400;

const MEDIUM_PREFIX_PATTERNS = [
  /^add\b/i,
  /^implement\b/i,
  /^create\b/i,
  /^build\b/i,
  /^write\b/i,
  /^design\b/i,
  /^update\b/i,
  /^modify\b/i,
  /^develop\b/i,
  /^refactor\b/i,
  /^test\b/i,
  /^debug\b/i,
];

function tokenCount(prompt: string): number {
  return prompt.trim().split(/\s+/).filter((t) => t.length > 0).length;
}

export function quickClassify(prompt: string): Tier | null {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return 'LOW';
  }

  const tokens = tokenCount(trimmed);

  // LOW: confirmation pattern (always short, unambiguous)
  if (CONFIRMATION_PATTERN.test(trimmed)) {
    return 'LOW';
  }

  // HIGH: contains high-complexity keywords (check before token count)
  for (const pattern of HIGH_KEYWORD_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'HIGH';
    }
  }

  // HIGH: longer than 400 tokens
  if (tokens > HIGH_TOKEN_THRESHOLD) {
    return 'HIGH';
  }

  // MEDIUM indicators: action verbs that suggest real work — skip LOW token count
  for (const pattern of MEDIUM_PREFIX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return null;
    }
  }

  // LOW: fewer than 8 tokens (after HIGH keyword and MEDIUM prefix checks)
  if (tokens < LOW_TOKEN_THRESHOLD && !CONTEXT_REF.test(trimmed)) {
    return 'LOW';
  }

  // LOW: starts with known low-complexity prefixes
  for (const pattern of LOW_PREFIX_PATTERNS) {
    if (pattern.test(trimmed) && !CONTEXT_REF.test(trimmed)) {
      return 'LOW';
    }
  }

  // LOW: completion prefixes
  for (const pattern of COMPLETION_PREFIXES) {
    if (pattern.test(trimmed)) {
      return 'LOW';
    }
  }

  // Fall through to Haiku classification
  return null;
}
