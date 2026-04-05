#!/usr/bin/env node

import { route } from '../router/router';
import { loadConfig } from '../router/config';
import { logDecision, getSessionId, hashPrompt } from '../telemetry/logger';
import { recordRoutingEvent } from '../telemetry/feedback';
import { printStats } from './stats';

async function handleRoute(args: string[]): Promise<void> {
  const prompt = args[0];
  if (!prompt) {
    process.stderr.write('Usage: claude-router route <prompt> [--format model]\n');
    process.exit(1);
  }

  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'full';

  const config = loadConfig();
  const decision = await route(prompt, config);

  // Log telemetry
  const ts = new Date().toISOString();
  logDecision({
    ts,
    session_id: getSessionId(),
    prompt_hash: hashPrompt(prompt),
    prompt_tokens: prompt.trim().split(/\s+/).filter((t) => t.length > 0).length,
    tier: decision.tier,
    model: decision.model,
    source: decision.source,
    latency_ms: decision.latency_ms,
    manual_override: decision.source === 'override',
  });
  recordRoutingEvent(ts);

  if (format === 'model') {
    process.stdout.write(decision.model);
  } else if (format === 'directive') {
    process.stdout.write(decision.directive);
  } else {
    process.stdout.write(JSON.stringify(decision, null, 2) + '\n');
  }
}

function handleStats(args: string[]): void {
  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 7;
  printStats(isNaN(days) ? 7 : days);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'route':
      await handleRoute(args.slice(1));
      break;
    case 'stats':
      handleStats(args.slice(1));
      break;
    case '--help':
    case '-h':
    case undefined:
      console.log(`claude-router — Intelligent model routing for Claude Code

Usage:
  claude-router route <prompt> [--format model|directive|full]
  claude-router stats [--days N]

Commands:
  route    Classify a prompt and return the routing decision
  stats    Show routing statistics for the last N days (default: 7)`);
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      process.exit(1);
  }
}

main().catch((err: Error) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
