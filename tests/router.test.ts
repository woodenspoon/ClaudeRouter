import { describe, it, expect, vi } from 'vitest';
import { route } from '../src/router/router';
import type { RouterConfig } from '../src/router/config';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'MEDIUM' }],
          usage: { input_tokens: 50 },
        }),
      };
    },
  };
});

const defaultConfig: RouterConfig = {
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

describe('route', () => {
  it('"//opus explain this architecture" → Opus, source: override', async () => {
    const decision = await route('//opus explain this architecture', defaultConfig);
    expect(decision.model).toBe('claude-opus-4-8');
    expect(decision.source).toBe('override');
    expect(decision.stripped_prompt).toBe('explain this architecture');
  });

  it('override keyword is case-insensitive', async () => {
    const decision = await route('//OPUS explain this', defaultConfig);
    expect(decision.model).toBe('claude-opus-4-8');
    expect(decision.source).toBe('override');
  });

  it('conservative mode shifts LOW → MEDIUM model', async () => {
    const conservativeConfig: RouterConfig = {
      ...defaultConfig,
      conservative: true,
    };
    // "hello" is classified as LOW by signals (1 token, no context ref)
    const decision = await route('hello', conservativeConfig);
    expect(decision.tier).toBe('LOW');
    // But the model should be MEDIUM (Sonnet) due to conservative shift
    expect(decision.model).toBe('claude-sonnet-4-6');
  });

  it('conservative mode shifts MEDIUM → HIGH model', async () => {
    const conservativeConfig: RouterConfig = {
      ...defaultConfig,
      conservative: true,
    };
    // Use a prompt that falls through to Haiku (mocked to return MEDIUM)
    const decision = await route(
      'implement the user authentication flow with JWT tokens',
      conservativeConfig
    );
    expect(decision.tier).toBe('MEDIUM');
    expect(decision.model).toBe('claude-opus-4-8');
  });

  it('config CWD override takes precedence over global', async () => {
    const customConfig: RouterConfig = {
      ...defaultConfig,
      tiers: {
        ...defaultConfig.tiers,
        LOW: 'custom-haiku-model',
      },
    };
    // "hello" is classified as LOW by signals (1 token, no context ref)
    const decision = await route('hello', customConfig);
    expect(decision.model).toBe('custom-haiku-model');
  });

  it('LOW prompt gets correct directive', async () => {
    // "hello" is classified as LOW by signals (1 token, no context ref)
    const decision = await route('hello', defaultConfig);
    expect(decision.directive).toContain('[ROUTER]');
    expect(decision.directive).toContain('LOW');
    expect(decision.directive).toContain('Haiku subagent');
  });

  it('HIGH prompt gets direct handling directive', async () => {
    const decision = await route(
      'refactor the entire auth system from scratch',
      defaultConfig
    );
    expect(decision.directive).toContain('[ROUTER]');
    expect(decision.directive).toContain('HIGH');
    expect(decision.directive).toContain('Handle this task directly');
  });

  it('override gets special directive', async () => {
    const decision = await route('//opus do something', defaultConfig);
    expect(decision.directive).toContain('[ROUTER]');
    expect(decision.directive).toContain('User explicitly requested Opus');
  });
});
