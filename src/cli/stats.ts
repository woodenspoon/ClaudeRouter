import { readEvents, type RoutingEvent } from '../telemetry/logger';
import { computeFollowupStats } from '../telemetry/feedback';

const AVG_PROMPT_TOKENS = 200;

interface StatsResult {
  days: number;
  total: number;
  low: number;
  medium: number;
  high: number;
  estimatedOpusSaved: number;
  followupRate: number;
  manualOverrides: number;
}

function computeStats(days: number): StatsResult {
  const events = readEvents();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const filtered = events.filter((e) => e.ts >= cutoffIso);

  let low = 0;
  let medium = 0;
  let high = 0;
  let overrides = 0;

  for (const event of filtered) {
    switch (event.tier) {
      case 'LOW':
        low++;
        break;
      case 'MEDIUM':
        medium++;
        break;
      case 'HIGH':
        high++;
        break;
    }
    if (event.manual_override) {
      overrides++;
    }
  }

  const total = filtered.length;
  // Estimated Opus saved = tokens that would have gone to Opus minus tokens actually sent
  // All prompts would have gone to Opus by default; LOW and MEDIUM were diverted
  const savedPrompts = low + medium;
  const estimatedOpusSaved = savedPrompts * AVG_PROMPT_TOKENS;

  const feedbackStats = computeFollowupStats(days);

  return {
    days,
    total,
    low,
    medium,
    high,
    estimatedOpusSaved,
    followupRate: feedbackStats.followup_rate,
    manualOverrides: overrides,
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) {
    return (n / 1_000_000_000).toFixed(1) + 'B';
  }
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + 'M';
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1) + 'K';
  }
  return n.toString();
}

function pct(part: number, total: number): string {
  if (total === 0) return '0.0%';
  return ((part / total) * 100).toFixed(1) + '%';
}

function pad(str: string, width: number): string {
  return str.padStart(width);
}

export function printStats(days: number = 7): void {
  const stats = computeStats(days);
  const divider = '─'.repeat(41);

  const lines = [
    `ClaudeRouter — last ${stats.days} days`,
    divider,
    `Prompts routed:      ${pad(stats.total.toString(), 5)}`,
    `LOW  → Haiku:        ${pad(stats.low.toString(), 5)}   (${pct(stats.low, stats.total)})`,
    `MED  → Sonnet:       ${pad(stats.medium.toString(), 5)}   (${pct(stats.medium, stats.total)})`,
    `HIGH → Opus:         ${pad(stats.high.toString(), 5)}   (${pct(stats.high, stats.total)})`,
    `Estimated Opus saved:   ${formatNumber(stats.estimatedOpusSaved)} tokens`,
    `Follow-up rate (LOW):   ${(stats.followupRate * 100).toFixed(1)}%    ← routing accuracy`,
    `Manual overrides:       ${stats.manualOverrides}`,
    divider,
  ];

  for (const line of lines) {
    console.log(line);
  }
}

export { computeStats };
