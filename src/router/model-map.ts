import type { RouterConfig } from './config';

export type Tier = 'LOW' | 'MEDIUM' | 'HIGH';

export function resolveModel(tier: Tier, config: RouterConfig): string {
  const effectiveTier = config.conservative ? shiftUp(tier) : tier;
  return config.tiers[effectiveTier] ?? config.fallback;
}

export function shiftUp(tier: Tier): Tier {
  switch (tier) {
    case 'LOW':
      return 'MEDIUM';
    case 'MEDIUM':
      return 'HIGH';
    case 'HIGH':
      return 'HIGH';
  }
}
