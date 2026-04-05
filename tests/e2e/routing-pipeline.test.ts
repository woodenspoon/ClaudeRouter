import { describe, it, expect, vi, beforeEach } from 'vitest';
import { route } from '../../src/router/router';
import type { RouterConfig } from '../../src/router/config';
import type { RoutingDecision } from '../../src/router/router';

const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'MEDIUM' }],
    usage: { input_tokens: 50 },
  });
  return { mockCreate };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

const defaultConfig: RouterConfig = {
  tiers: {
    LOW: 'claude-haiku-4-5-20251001',
    MEDIUM: 'claude-sonnet-4-6',
    HIGH: 'claude-opus-4-6',
  },
  fallback: 'claude-sonnet-4-6',
  conservative: false,
  override_keyword: '//opus',
};

function validateShape(decision: RoutingDecision, inputPrompt: string): void {
  expect(decision.model).toMatch(/^claude-/);
  expect(decision.latency_ms).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(decision.latency_ms)).toBe(true);
  expect(['LOW', 'MEDIUM', 'HIGH']).toContain(decision.tier);
  expect(['signal', 'haiku', 'fallback', 'override']).toContain(decision.source);
  expect(decision.original_prompt).toBe(inputPrompt);
  expect(decision.stripped_prompt).toBeDefined();
}

describe('routing pipeline e2e', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'MEDIUM' }],
      usage: { input_tokens: 50 },
    });
  });

  describe('signal path (no API call)', () => {
    it('self-contained knowledge question → LOW, source: signal', async () => {
      const prompt = 'what is a monad';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('LOW');
      expect(decision.source).toBe('signal');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('short stateless query → LOW, source: signal', async () => {
      const prompt = 'list all python files';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('LOW');
      expect(decision.source).toBe('signal');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('very long prompt (401+ tokens) → HIGH, source: signal', async () => {
      const prompt = Array(401).fill('token').join(' ');
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('HIGH');
      expect(decision.source).toBe('signal');
      expect(decision.model).toBe('claude-opus-4-6');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('architecture keyword present → HIGH, source: signal', async () => {
      const prompt = 'redesign the API layer with new tradeoffs';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('HIGH');
      expect(decision.source).toBe('signal');
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('haiku path (mock returns controlled tier)', () => {
    it('standard feature request → Sonnet model string', async () => {
      const prompt = 'add a login page with OAuth support';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('MEDIUM');
      expect(decision.source).toBe('haiku');
      expect(decision.model).toBe('claude-sonnet-4-6');
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    it('bug fix request → Sonnet model string', async () => {
      const prompt = 'fix the null pointer exception in the login handler';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('MEDIUM');
      expect(decision.source).toBe('haiku');
      expect(decision.model).toBe('claude-sonnet-4-6');
    });

    it('test writing request → Sonnet model string', async () => {
      const prompt = 'create unit tests for the auth module covering edge cases';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('MEDIUM');
      expect(decision.source).toBe('haiku');
      expect(decision.model).toBe('claude-sonnet-4-6');
    });
  });

  describe('override path', () => {
    it('"  //opus leading space" → override fires after trimStart', async () => {
      const prompt = '  //opus leading space';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.source).toBe('override');
      expect(decision.model).toBe('claude-opus-4-6');
      expect(decision.stripped_prompt).toBe('leading space');
    });

    it('"//opus" with nothing after → override fires, stripped_prompt is ""', async () => {
      const prompt = '//opus';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.source).toBe('override');
      expect(decision.model).toBe('claude-opus-4-6');
      expect(decision.stripped_prompt).toBe('');
    });
  });

  describe('fallback path (API errors and edge cases)', () => {
    it('network error → tier: MEDIUM, source: fallback', async () => {
      mockCreate.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const prompt = 'add a caching layer for the database queries';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('MEDIUM');
      expect(decision.source).toBe('fallback');
      expect(decision.model).toBe('claude-sonnet-4-6');
    });

    it('empty content array → MEDIUM, fallback', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [],
        usage: { input_tokens: 50 },
      });
      const prompt = 'add a notification system for user alerts';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('MEDIUM');
      expect(decision.source).toBe('fallback');
    });

    it('unparseable text → MEDIUM, fallback', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'potato salad' }],
        usage: { input_tokens: 50 },
      });
      const prompt = 'add a dark mode toggle to the settings page';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('MEDIUM');
      expect(decision.source).toBe('fallback');
    });

    it('"Low." with punctuation → parser extracts LOW correctly', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Low.' }],
        usage: { input_tokens: 50 },
      });
      const prompt = 'add a simple health check endpoint';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('LOW');
      expect(decision.source).toBe('haiku');
      expect(decision.model).toBe('claude-haiku-4-5-20251001');
    });

    it('"I think this is MEDIUM" → parser extracts MEDIUM from sentence', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'I think this is MEDIUM' }],
        usage: { input_tokens: 50 },
      });
      const prompt = 'add pagination to the user list API';
      const decision = await route(prompt, defaultConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('MEDIUM');
      expect(decision.source).toBe('haiku');
    });
  });

  describe('conservative mode', () => {
    const conservativeConfig: RouterConfig = {
      ...defaultConfig,
      conservative: true,
    };

    it('HIGH tier + conservative: true → model is still HIGH', async () => {
      // "yes" is HIGH via signal (confirmation)
      const prompt = 'yes';
      const decision = await route(prompt, conservativeConfig);
      validateShape(decision, prompt);
      expect(decision.tier).toBe('HIGH');
      // shiftUp(HIGH) = HIGH, so model stays Opus
      expect(decision.model).toBe('claude-opus-4-6');
    });

    it('override + conservative: true → Opus model (override wins)', async () => {
      const prompt = '//opus check security';
      const decision = await route(prompt, conservativeConfig);
      validateShape(decision, prompt);
      expect(decision.source).toBe('override');
      expect(decision.model).toBe('claude-opus-4-6');
    });
  });

  describe('result shape validation', () => {
    it('all fields present with correct types on LOW signal path', async () => {
      const prompt = 'hello';
      const decision = await route(prompt, defaultConfig);
      expect(decision.model).toMatch(/^claude-/);
      expect(decision.latency_ms).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(decision.latency_ms)).toBe(true);
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(decision.tier);
      expect(['signal', 'haiku', 'fallback', 'override']).toContain(decision.source);
      expect(decision.original_prompt).toBe(prompt);
      expect(typeof decision.stripped_prompt).toBe('string');
      expect(typeof decision.directive).toBe('string');
      expect(decision.directive).toContain('[ROUTER]');
    });

    it('all fields present with correct types on haiku path', async () => {
      const prompt = 'add a feature flag system';
      const decision = await route(prompt, defaultConfig);
      expect(decision.model).toMatch(/^claude-/);
      expect(decision.latency_ms).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(decision.latency_ms)).toBe(true);
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(decision.tier);
      expect(['signal', 'haiku', 'fallback', 'override']).toContain(decision.source);
      expect(decision.original_prompt).toBe(prompt);
      expect(typeof decision.stripped_prompt).toBe('string');
    });
  });
});
