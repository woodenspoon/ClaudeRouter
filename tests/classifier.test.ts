import { describe, it, expect, vi } from 'vitest';
import { classify } from '../src/classifier/classifier';

const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'MEDIUM' }],
    usage: { input_tokens: 50 },
  });
  return { mockCreate };
});

// Mock the Anthropic SDK to avoid real API calls in tests
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

describe('classify', () => {
  it('returns MEDIUM on API failure (fallback safety)', async () => {
    // Make the mock reject for this test
    mockCreate.mockRejectedValueOnce(new Error('API error'));

    // Use a prompt that won't be caught by signals (needs to go to Haiku)
    const result = await classify('implement the user authentication flow with JWT tokens');
    expect(result.tier).toBe('MEDIUM');
    expect(result.source).toBe('fallback');
  });

  it('returns correct tier for known LOW prompts via signal', async () => {
    const result = await classify('yes');
    expect(result.tier).toBe('LOW');
    expect(result.source).toBe('signal');
  });

  it('returns correct tier for known HIGH prompts via signal', async () => {
    const result = await classify('refactor the entire auth system from scratch');
    expect(result.tier).toBe('HIGH');
    expect(result.source).toBe('signal');
  });

  it('source is "signal" when quickClassify returns a result', async () => {
    const result = await classify('ok');
    expect(result.source).toBe('signal');
    expect(result.tier).toBe('LOW');
  });

  it('tracks latency_ms', async () => {
    const result = await classify('yes');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(typeof result.latency_ms).toBe('number');
  });

  it('reports prompt_tokens for signal-classified prompts', async () => {
    const result = await classify('fix the typo');
    expect(result.prompt_tokens).toBeGreaterThan(0);
  });
});
