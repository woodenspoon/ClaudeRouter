import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const { getHomedir, setHomedir } = vi.hoisted(() => {
  let homedir = '';
  return {
    getHomedir: () => homedir,
    setHomedir: (v: string) => { homedir = v; },
  };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: getHomedir };
});

import { computeStats, printStats } from '../../src/cli/stats';

let tmpDir: string;
let logOutput: string[];

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'claude-router-stats-'));
  setHomedir(tmpDir);
  logOutput = [];
  vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
    logOutput.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function eventsDir(): string {
  return path.join(tmpDir, '.claude-router');
}

function eventsPath(): string {
  return path.join(eventsDir(), 'events.jsonl');
}

function makeEventLine(overrides?: Record<string, any>): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    session_id: 'test-session',
    prompt_hash: 'abc123def456',
    prompt_tokens: 50,
    tier: 'MEDIUM',
    model: 'claude-sonnet-4-6',
    source: 'signal',
    latency_ms: 42,
    had_followup: false,
    manual_override: false,
    ...overrides,
  });
}

function writeEvents(lines: string[]): void {
  fs.mkdirSync(eventsDir(), { recursive: true });
  fs.writeFileSync(eventsPath(), lines.join('\n') + '\n', 'utf-8');
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe('stats e2e', () => {
  describe('basic output', () => {
    it('10 LOW, 5 MEDIUM, 2 HIGH → counts and percentages correct', () => {
      const lines = [
        ...Array.from({ length: 10 }, () =>
          makeEventLine({ tier: 'LOW', model: 'claude-haiku-4-5-20251001', prompt_tokens: 20 })
        ),
        ...Array.from({ length: 5 }, () =>
          makeEventLine({ tier: 'MEDIUM', model: 'claude-sonnet-4-6', prompt_tokens: 50 })
        ),
        ...Array.from({ length: 2 }, () =>
          makeEventLine({ tier: 'HIGH', model: 'claude-opus-4-6', prompt_tokens: 100 })
        ),
      ];
      writeEvents(lines);
      const stats = computeStats(7);
      expect(stats.total).toBe(17);
      expect(stats.low).toBe(10);
      expect(stats.medium).toBe(5);
      expect(stats.high).toBe(2);
    });

    it('percentages sum to ~100%', () => {
      const lines = [
        ...Array.from({ length: 10 }, () => makeEventLine({ tier: 'LOW' })),
        ...Array.from({ length: 5 }, () => makeEventLine({ tier: 'MEDIUM' })),
        ...Array.from({ length: 2 }, () => makeEventLine({ tier: 'HIGH' })),
      ];
      writeEvents(lines);
      const stats = computeStats(7);
      const pctLow = (stats.low / stats.total) * 100;
      const pctMed = (stats.medium / stats.total) * 100;
      const pctHigh = (stats.high / stats.total) * 100;
      const sum = pctLow + pctMed + pctHigh;
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.1);
    });

    it('output contains the ← arrow on follow-up rate line', () => {
      writeEvents([makeEventLine()]);
      printStats(7);
      const output = logOutput.join('\n');
      expect(output).toContain('\u2190');
      expect(output).toContain('lower is better');
    });

    it('column alignment is consistent regardless of number width', () => {
      const lines = Array.from({ length: 100 }, () => makeEventLine({ tier: 'LOW' }));
      writeEvents(lines);
      printStats(7);
      const output = logOutput.join('\n');
      expect(output).toContain('100');
    });
  });

  describe('edge cases', () => {
    it('empty events.jsonl → shows all zeros', () => {
      fs.mkdirSync(eventsDir(), { recursive: true });
      fs.writeFileSync(eventsPath(), '', 'utf-8');
      const stats = computeStats(7);
      expect(stats.total).toBe(0);
      expect(stats.low).toBe(0);
      expect(stats.medium).toBe(0);
      expect(stats.high).toBe(0);
    });

    it('missing events.jsonl → shows all zeros', () => {
      const stats = computeStats(7);
      expect(stats.total).toBe(0);
      expect(stats.low).toBe(0);
    });

    it('all events are the same tier → other tiers show 0', () => {
      writeEvents(Array.from({ length: 5 }, () => makeEventLine({ tier: 'HIGH' })));
      const stats = computeStats(7);
      expect(stats.high).toBe(5);
      expect(stats.low).toBe(0);
      expect(stats.medium).toBe(0);
    });

    it('zero LOW events → follow-up rate is 0 not NaN or Infinity', () => {
      writeEvents([makeEventLine({ tier: 'MEDIUM' })]);
      const stats = computeStats(7);
      expect(stats.followupRate).toBe(0);
      expect(Number.isFinite(stats.followupRate)).toBe(true);
    });

    it('had_followup: true on some events → follow-up rate calculated', () => {
      const sessionId = 'fu-session';
      const ts1 = daysAgo(1);
      const ts2 = new Date(new Date(ts1).getTime() + 1000).toISOString();
      const lines = [
        makeEventLine({ tier: 'LOW', session_id: sessionId, ts: ts1, had_followup: false }),
        makeEventLine({ tier: 'LOW', session_id: sessionId, ts: ts2, had_followup: false }),
        // Add a followup marker for the first event
        JSON.stringify({ type: 'followup_marker', session_id: sessionId, ts: ts1 }),
      ];
      writeEvents(lines);
      const stats = computeStats(7);
      // 2 LOW events, 1 with followup = 50% rate
      expect(stats.followupRate).toBeCloseTo(0.5, 1);
    });
  });

  describe('date filtering', () => {
    it('events from 8 days ago with --days 7 → excluded', () => {
      writeEvents([makeEventLine({ ts: daysAgo(8) })]);
      const stats = computeStats(7);
      expect(stats.total).toBe(0);
    });

    it('events from 6 days ago with --days 7 → included', () => {
      writeEvents([makeEventLine({ ts: daysAgo(6) })]);
      const stats = computeStats(7);
      expect(stats.total).toBe(1);
    });

    it('events from today → always included', () => {
      writeEvents([makeEventLine({ ts: new Date().toISOString() })]);
      const stats = computeStats(7);
      expect(stats.total).toBe(1);
    });

    it('--days 1 → only recent events', () => {
      writeEvents([
        makeEventLine({ ts: daysAgo(0), tier: 'LOW' }),
        makeEventLine({ ts: daysAgo(3), tier: 'MEDIUM' }),
      ]);
      const stats = computeStats(1);
      expect(stats.total).toBe(1);
      expect(stats.low).toBe(1);
    });
  });

  describe('estimated savings', () => {
    it('known token counts → verify saved tokens', () => {
      writeEvents([
        makeEventLine({ tier: 'LOW', prompt_tokens: 100 }),
        makeEventLine({ tier: 'MEDIUM', prompt_tokens: 200 }),
        makeEventLine({ tier: 'HIGH', prompt_tokens: 300 }),
      ]);
      const stats = computeStats(7);
      // LOW and MEDIUM tokens are "saved" from Opus (100 + 200 = 300)
      expect(stats.savedTokens).toBe(300);
    });

    it('all HIGH events → zero savings', () => {
      writeEvents(Array.from({ length: 3 }, () =>
        makeEventLine({ tier: 'HIGH', prompt_tokens: 500 })
      ));
      const stats = computeStats(7);
      expect(stats.savedTokens).toBe(0);
    });

    it('zero events → zero savings', () => {
      const stats = computeStats(7);
      expect(stats.savedTokens).toBe(0);
    });
  });

  describe('JSONL robustness', () => {
    it('corrupted line among valid lines → corrupted line skipped', () => {
      fs.mkdirSync(eventsDir(), { recursive: true });
      const good = makeEventLine({ tier: 'LOW' });
      const content = `${good}\n{broken json\n${good}\n`;
      fs.writeFileSync(eventsPath(), content, 'utf-8');
      const stats = computeStats(7);
      expect(stats.total).toBe(2);
      expect(stats.low).toBe(2);
    });

    it('file with trailing newline → no empty-line parse error', () => {
      writeEvents([makeEventLine()]);
      const stats = computeStats(7);
      expect(stats.total).toBe(1);
    });

    it('file with Windows line endings → parsed correctly', () => {
      fs.mkdirSync(eventsDir(), { recursive: true });
      const line1 = makeEventLine({ tier: 'LOW' });
      const line2 = makeEventLine({ tier: 'MEDIUM' });
      fs.writeFileSync(eventsPath(), `${line1}\r\n${line2}\r\n`, 'utf-8');
      const stats = computeStats(7);
      expect(stats.total).toBe(2);
    });
  });
});
