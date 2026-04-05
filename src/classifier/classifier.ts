import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { quickClassify } from './signals';

export type Tier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ClassificationResult {
  tier: Tier;
  source: 'signal' | 'haiku' | 'fallback';
  latency_ms: number;
  prompt_tokens: number;
}

const VALID_TIERS: ReadonlySet<string> = new Set(['LOW', 'MEDIUM', 'HIGH']);

let cachedClient: Anthropic | undefined;
function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

let cachedTemplate: string | undefined;

function loadPromptTemplate(): string {
  if (cachedTemplate !== undefined) {
    return cachedTemplate;
  }
  const candidates = [
    path.join(__dirname, '..', 'classifier', 'prompt.md'),
    path.join(__dirname, 'prompt.md'),
  ];
  for (const candidate of candidates) {
    try {
      cachedTemplate = fs.readFileSync(candidate, 'utf-8');
      return cachedTemplate;
    } catch {
      // try next candidate
    }
  }
  // Inline fallback template
  cachedTemplate = `You are a task complexity classifier for an AI coding assistant.
Output exactly one word: LOW, MEDIUM, or HIGH. No explanation. No punctuation. Just the word.
Prompt to classify:
{{PROMPT}}
Complexity:`;
  return cachedTemplate;
}

function parseTier(raw: string): Tier | null {
  const cleaned = raw.trim().toUpperCase();
  if (VALID_TIERS.has(cleaned)) {
    return cleaned as Tier;
  }
  // Try extracting from a longer response
  for (const tier of ['HIGH', 'MEDIUM', 'LOW'] as const) {
    if (cleaned.includes(tier)) {
      return tier;
    }
  }
  return null;
}

export async function classify(prompt: string): Promise<ClassificationResult> {
  const start = Date.now();

  // Stage 1: Pre-Haiku heuristics
  const signalResult = quickClassify(prompt);
  if (signalResult !== null) {
    return {
      tier: signalResult,
      source: 'signal',
      latency_ms: Date.now() - start,
      prompt_tokens: prompt.trim().split(/\s+/).filter((t) => t.length > 0).length,
    };
  }

  // Stage 2: Haiku classification
  try {
    const client = getClient();
    const template = loadPromptTemplate();
    const classificationPrompt = template.replace('{{PROMPT}}', () => prompt);

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: classificationPrompt,
        },
      ],
    }, {
      timeout: 3000,
    });

    const latency = Date.now() - start;
    const textBlock = response.content.find((b: Anthropic.ContentBlock) => b.type === 'text');
    const rawText = textBlock ? textBlock.text : '';
    const tier = parseTier(rawText);

    if (tier !== null) {
      return {
        tier,
        source: 'haiku',
        latency_ms: latency,
        prompt_tokens: response.usage?.input_tokens ?? 0,
      };
    }

    // Parse failure: fallback to MEDIUM
    return {
      tier: 'MEDIUM',
      source: 'fallback',
      latency_ms: latency,
      prompt_tokens: response.usage?.input_tokens ?? 0,
    };
  } catch {
    // API error: fallback to MEDIUM, never throw
    return {
      tier: 'MEDIUM',
      source: 'fallback',
      latency_ms: Date.now() - start,
      prompt_tokens: 0,
    };
  }
}
