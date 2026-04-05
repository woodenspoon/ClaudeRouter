import { describe, it, expect } from 'vitest';
import { quickClassify } from '../src/classifier/signals';

describe('quickClassify', () => {
  it('"yes" → HIGH', () => {
    expect(quickClassify('yes')).toBe('HIGH');
  });

  it('"ok" → HIGH', () => {
    expect(quickClassify('ok')).toBe('HIGH');
  });

  it('"lgtm" → HIGH', () => {
    expect(quickClassify('lgtm')).toBe('HIGH');
  });

  it('"go ahead" → HIGH', () => {
    expect(quickClassify('go ahead')).toBe('HIGH');
  });

  it('"sounds good." → HIGH (with period)', () => {
    expect(quickClassify('sounds good.')).toBe('HIGH');
  });

  it('prompt with 3 words containing context reference → null (deferred to Haiku)', () => {
    expect(quickClassify('fix the bug')).toBeNull();
  });

  it('"what does this function do" → null (context reference: "this", "the function")', () => {
    expect(quickClassify('what does this function do')).toBeNull();
  });

  it('"show me the error logs" → null (context reference: "the error")', () => {
    expect(quickClassify('show me the error logs')).toBeNull();
  });

  it('"list all files in src" → LOW (starts with "list")', () => {
    expect(quickClassify('list all files in src')).toBe('LOW');
  });

  it('"done" → LOW (completion prefix)', () => {
    expect(quickClassify('done')).toBe('LOW');
  });

  it('"✓ completed the task" → LOW (starts with ✓)', () => {
    expect(quickClassify('✓ completed the task')).toBe('LOW');
  });

  it('"refactor the entire auth system from scratch" → HIGH', () => {
    expect(quickClassify('refactor the entire auth system from scratch')).toBe('HIGH');
  });

  it('"do a security review of the payment module" → HIGH (contains "security review")', () => {
    expect(quickClassify('do a security review of the payment module')).toBe('HIGH');
  });

  it('"architect the new microservices layer" → HIGH (contains "architect")', () => {
    expect(quickClassify('architect the new microservices layer')).toBe('HIGH');
  });

  it('prompt with 500 words → HIGH', () => {
    const longPrompt = Array(500).fill('word').join(' ');
    expect(quickClassify(longPrompt)).toBe('HIGH');
  });

  it('"add an endpoint for user login" → null (falls through to Haiku)', () => {
    expect(quickClassify('add an endpoint for user login')).toBeNull();
  });

  it('"implement the user authentication flow with JWT tokens" → null', () => {
    expect(quickClassify('implement the user authentication flow with JWT tokens')).toBeNull();
  });

  it('"write tests for the payment module covering edge cases" → null', () => {
    expect(quickClassify('write tests for the payment module covering edge cases')).toBeNull();
  });

  it('empty string → LOW', () => {
    expect(quickClassify('')).toBe('LOW');
  });

  it('"sure" → HIGH (context-dependent confirmation)', () => {
    expect(quickClassify('sure')).toBe('HIGH');
  });

  it('"do it" → HIGH (context-dependent confirmation)', () => {
    expect(quickClassify('do it')).toBe('HIGH');
  });

  it('Japanese prompt → null (deferred to Haiku for non-Latin scripts)', () => {
    expect(quickClassify('このコードのバグを修正してください')).toBeNull();
  });

  it('short numeric response "201" → LOW (under token threshold, no context ref)', () => {
    expect(quickClassify('201')).toBe('LOW');
  });
});
