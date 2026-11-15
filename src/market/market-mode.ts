import { BadRequestException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export const MARKET_MODES = ['osrs', 'osrs-hc'] as const;
export type MarketMode = (typeof MARKET_MODES)[number];
export const DEFAULT_MARKET_MODE: MarketMode = 'osrs';

const storage = new AsyncLocalStorage<MarketMode>();

export function parseMarketMode(value: unknown): MarketMode {
  if (value == null || value === '') return DEFAULT_MARKET_MODE;
  if (typeof value === 'string' && (MARKET_MODES as readonly string[]).includes(value)) {
    return value as MarketMode;
  }

  throw new BadRequestException(`market must be one of: ${MARKET_MODES.join(', ')}`);
}

export function getMarketMode(): MarketMode {
  return storage.getStore() ?? DEFAULT_MARKET_MODE;
}

export function runWithMarketMode<T>(marketMode: MarketMode, callback: () => T): T {
  return storage.run(marketMode, callback);
}

export function marketCacheKey(baseKey: string, marketMode = getMarketMode()): string {
  return `${baseKey}:${marketMode}`;
}

export function marketApiPath(marketMode = getMarketMode()): string {
  return marketMode === 'osrs-hc' ? 'v2/osrs-hc' : 'v1/osrs';
}
