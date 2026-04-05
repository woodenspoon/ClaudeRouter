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
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
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
    ensureDir();
    const marker = JSON.stringify({ type: 'followup_marker', session_id, ts }) + '\n';
    fs.appendFileSync(getEventsPath(), marker, 'utf-8');
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
    const followups = new Set<string>();

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'followup_marker') {
          followups.add(`${parsed.session_id}:${parsed.ts}`);
        } else if (parsed.ts && typeof parsed.ts === 'string') {
          events.push(parsed as RoutingEvent);
        }
      } catch {
        // skip malformed lines
      }
    }

    // Reconcile followup markers with events
    for (const event of events) {
      if (followups.has(`${event.session_id}:${event.ts}`)) {
        event.had_followup = true;
      }
    }

    return events;
  } catch {
    return [];
  }
}
