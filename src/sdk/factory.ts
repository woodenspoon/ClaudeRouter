import { route, type RoutingDecision } from '../router/router';
import { loadConfig, type RouterConfig } from '../router/config';
import { logDecision, getSessionId, hashPrompt } from '../telemetry/logger';
import { recordRoutingEvent } from '../telemetry/feedback';

export interface RouterInstance {
  route(prompt: string): Promise<RoutingDecision>;
  stats(): SessionStats;
}

export interface SessionStats {
  total: number;
  low: number;
  medium: number;
  high: number;
  overrides: number;
  avg_latency_ms: number;
}

export function createRouter(options?: {
  config?: Partial<RouterConfig>;
  telemetry?: boolean;
}): RouterInstance {
  const baseConfig = loadConfig();
  const config: RouterConfig = {
    ...baseConfig,
    ...options?.config,
    tiers: {
      ...baseConfig.tiers,
      ...options?.config?.tiers,
    },
  };

  const telemetryEnabled = options?.telemetry ?? true;
  const sessionStats: SessionStats = {
    total: 0,
    low: 0,
    medium: 0,
    high: 0,
    overrides: 0,
    avg_latency_ms: 0,
  };

  let totalLatency = 0;

  return {
    async route(prompt: string): Promise<RoutingDecision> {
      const decision = await route(prompt, config);

      // Update session stats
      sessionStats.total++;
      totalLatency += decision.latency_ms;
      sessionStats.avg_latency_ms = Math.round(totalLatency / sessionStats.total);

      switch (decision.tier) {
        case 'LOW':
          sessionStats.low++;
          break;
        case 'MEDIUM':
          sessionStats.medium++;
          break;
        case 'HIGH':
          sessionStats.high++;
          break;
      }
      if (decision.source === 'override') {
        sessionStats.overrides++;
      }

      // Log telemetry if enabled
      if (telemetryEnabled) {
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
      }

      return decision;
    },

    stats(): SessionStats {
      return { ...sessionStats };
    },
  };
}
