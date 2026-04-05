import { describe, it, expect } from 'vitest';
import { quickClassify } from '../src/classifier/signals';

describe('quickClassify', () => {
  it('"yes" → LOW', () => {
    expect(quickClassify('yes')).toBe('LOW');
  });

  it('"ok" → LOW', () => {
    expect(quickClassify('ok')).toBe('LOW');
  });

  it('"lgtm" → LOW', () => {
    expect(quickClassify('lgtm')).toBe('LOW');
  });

  it('"go ahead" → LOW', () => {
    expect(quickClassify('go ahead')).toBe('LOW');
  });

  it('"sounds good." → LOW (with period)', () => {
    expect(quickClassify('sounds good.')).toBe('LOW');
  });

  it('prompt with 3 words → LOW (fewer than 8 tokens)', () => {
    expect(quickClassify('fix the bug')).toBe('LOW');
  });

  it('"what does this function do" → LOW (starts with "what does")', () => {
    expect(quickClassify('what does this function do')).toBe('LOW');
  });

  it('"show me the error logs" → LOW (starts with "show me")', () => {
    expect(quickClassify('show me the error logs')).toBe('LOW');
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
});
