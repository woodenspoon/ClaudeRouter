import { markFollowup, readEvents, getSessionId } from './logger';

const FOLLOWUP_WINDOW_MS = 60_000; // 60 seconds

let lastEventTs: string | null = null;
let lastEventSessionId: string | null = null;
let lastEventTime: number | null = null;

export function recordRoutingEvent(ts: string): void {
  const sessionId = getSessionId();

  // Check if this is a follow-up to the previous event
  if (
    lastEventTs !== null &&
    lastEventSessionId !== null &&
    lastEventTime !== null &&
    lastEventSessionId === sessionId
  ) {
    const elapsed = Date.now() - lastEventTime;
    if (elapsed < FOLLOWUP_WINDOW_MS) {
      markFollowup(lastEventSessionId, lastEventTs);
    }
  }

  // Track this event as the latest
  lastEventTs = ts;
  lastEventSessionId = sessionId;
  lastEventTime = Date.now();
}

export interface FeedbackStats {
  total_low: number;
  low_with_followup: number;
  followup_rate: number;
}

export function computeFollowupStats(daysBack: number = 7): FeedbackStats {
  const events = readEvents();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffIso = cutoff.toISOString();

  let totalLow = 0;
  let lowWithFollowup = 0;

  for (const event of events) {
    if (event.ts < cutoffIso) continue;
    if (event.tier === 'LOW') {
      totalLow++;
      if (event.had_followup) {
        lowWithFollowup++;
      }
    }
  }

  return {
    total_low: totalLow,
    low_with_followup: lowWithFollowup,
    followup_rate: totalLow > 0 ? lowWithFollowup / totalLow : 0,
  };
}
