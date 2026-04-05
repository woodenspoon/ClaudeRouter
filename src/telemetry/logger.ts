import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface RoutingEvent {
  ts: string;
  session_id: string;
  prompt_hash: string;
  prompt_tokens: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  model: string;
  source: 'signal' | 'haiku' | 'fallback' | 'override';
  latency_ms: number;
  had_followup: boolean;
  manual_override: boolean;
}

const SESSION_ID = crypto.randomUUID();

function getEventsDir(): string {
  return path.join(os.homedir(), '.claude-router');
}

function getEventsPath(): string {
  return path.join(getEventsDir(), 'events.jsonl');
}

function ensureDir(): void {
  const dir = getEventsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

export function getSessionId(): string {
  return SESSION_ID;
}

export function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12);
}

export function logDecision(event: Omit<RoutingEvent, 'had_followup'>): void {
  try {
    ensureDir();
    const full: RoutingEvent = { ...event, had_followup: false };
    const line = JSON.stringify(full) + '\n';
    fs.appendFileSync(getEventsPath(), line, 'utf-8');
  } catch {
    // Never throw — telemetry must not crash the hook
  }
}

export function markFollowup(session_id: string, ts: string): void {
  try {
    const eventsPath = getEventsPath();
    if (!fs.existsSync(eventsPath)) return;

    const content = fs.readFileSync(eventsPath, 'utf-8');
    const lines = content.split('\n');
    let modified = false;

    const updated = lines.map((line) => {
      if (!line.trim()) return line;
      try {
        const event = JSON.parse(line) as RoutingEvent;
        if (event.session_id === session_id && event.ts === ts && !event.had_followup) {
          event.had_followup = true;
          modified = true;
          return JSON.stringify(event);
        }
      } catch {
        // skip malformed lines
      }
      return line;
    });

    if (modified) {
      fs.writeFileSync(eventsPath, updated.join('\n'), 'utf-8');
    }
  } catch {
    // Never throw
  }
}

export function readEvents(): RoutingEvent[] {
  try {
    const eventsPath = getEventsPath();
    if (!fs.existsSync(eventsPath)) return [];

    const content = fs.readFileSync(eventsPath, 'utf-8');
    const events: RoutingEvent[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as RoutingEvent);
      } catch {
        // skip malformed lines
      }
    }

    return events;
  } catch {
    return [];
  }
}
