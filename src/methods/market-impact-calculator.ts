interface MarketImpactItem {
  id: number;
  quantity: number;
}

interface MarketImpactPrice {
  high?: number;
  low?: number;
}

interface MarketImpactVolume24h {
  high24h?: number;
  low24h?: number;
}

interface CalculateMarketImpactInput {
  inputs: MarketImpactItem[];
  outputs: MarketImpactItem[];
  pricesByItem: Record<number, MarketImpactPrice>;
  volumes24hByItem: Record<number, MarketImpactVolume24h>;
  alpha?: number;
  epsilon?: number;
}

export interface MarketImpactResult {
  marketImpactInstant: number;
  marketImpactSlow: number;
}

type MarketMode = 'instant' | 'slow';
type ItemSide = 'input' | 'output';

const HOURS_IN_DAY = 24;
const DEFAULT_ALPHA = 0.5;
const DEFAULT_EPSILON = 1;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const clampMinZero = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return value <= 0 ? 0 : value;
};

const toNonNegativeNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 0 ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed >= 0 ? parsed : 0;
    }
  }

  return null;
};

const getPriceWeight = (
  mode: MarketMode,
  side: ItemSide,
  itemId: number,
  pricesByItem: Record<number, MarketImpactPrice>,
): number => {
  const price = pricesByItem[itemId];
  if (!price) return 0;

  const low = toNonNegativeNumberOrNull(price.low) ?? 0;
  const high = toNonNegativeNumberOrNull(price.high) ?? low;

  if (mode === 'instant') {
    return side === 'input' ? high : low;
  }

  return side === 'input' ? low : high;
};

const getVolume24hForShare = (
  mode: MarketMode,
  side: ItemSide,
  itemId: number,
  volumes24hByItem: Record<number, MarketImpactVolume24h>,
): number | null => {
  const volume = volumes24hByItem[itemId];
  if (!volume) return null;

  if (mode === 'instant') {
    return side === 'input'
      ? toNonNegativeNumberOrNull(volume.high24h)
      : toNonNegativeNumberOrNull(volume.low24h);
  }

  return side === 'input'
    ? toNonNegativeNumberOrNull(volume.low24h)
    : toNonNegativeNumberOrNull(volume.high24h);
};

const computeItemShare = (
  quantity: number,
  mode: MarketMode,
  side: ItemSide,
  itemId: number,
  volumes24hByItem: Record<number, MarketImpactVolume24h>,
  epsilon: number,
): number => {
  const normalizedQty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  if (normalizedQty === 0) return 0;

  const volume24h = getVolume24hForShare(mode, side, itemId, volumes24hByItem);

  // Missing volume data is treated as max impact for that item.
  if (volume24h === null) {
    return 1;
  }

  const volumePerHour = Math.max(epsilon, volume24h / HOURS_IN_DAY);
  return clampMinZero(normalizedQty / volumePerHour);
};

const computeWeightedShare = (
  items: MarketImpactItem[],
  mode: MarketMode,
  side: ItemSide,
  pricesByItem: Record<number, MarketImpactPrice>,
  volumes24hByItem: Record<number, MarketImpactVolume24h>,
  epsilon: number,
): number => {
  if (items.length === 0) return 0;

  const entries = items.map((item) => {
    const quantity = Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
    const share = computeItemShare(quantity, mode, side, item.id, volumes24hByItem, epsilon);
    const value = quantity * getPriceWeight(mode, side, item.id, pricesByItem);
    return { share, value };
  });

  const totalValue = entries.reduce((acc, entry) => acc + entry.value, 0);
  if (totalValue <= 0) {
    return clampMinZero(entries.reduce((acc, entry) => acc + entry.share, 0) / entries.length);
  }

  const weightedShare = entries.reduce(
    (acc, entry) => acc + (entry.value / totalValue) * entry.share,
    0,
  );
  return clampMinZero(weightedShare);
};

export const calculateMarketImpact = ({
  inputs,
  outputs,
  pricesByItem,
  volumes24hByItem,
  alpha = DEFAULT_ALPHA,
  epsilon = DEFAULT_EPSILON,
}: CalculateMarketImpactInput): MarketImpactResult => {
  const normalizedAlpha = clamp01(alpha);
  const normalizedEpsilon = Number.isFinite(epsilon) && epsilon > 0 ? epsilon : DEFAULT_EPSILON;

  const instantInputsShare = computeWeightedShare(
    inputs,
    'instant',
    'input',
    pricesByItem,
    volumes24hByItem,
    normalizedEpsilon,
  );
  const instantOutputsShare = computeWeightedShare(
    outputs,
    'instant',
    'output',
    pricesByItem,
    volumes24hByItem,
    normalizedEpsilon,
  );

  const slowInputsShare = computeWeightedShare(
    inputs,
    'slow',
    'input',
    pricesByItem,
    volumes24hByItem,
    normalizedEpsilon,
  );
  const slowOutputsShare = computeWeightedShare(
    outputs,
    'slow',
    'output',
    pricesByItem,
    volumes24hByItem,
    normalizedEpsilon,
  );

  const marketImpactInstant = clampMinZero(
    normalizedAlpha * instantInputsShare + (1 - normalizedAlpha) * instantOutputsShare,
  );
  const marketImpactSlow = clampMinZero(
    normalizedAlpha * slowInputsShare + (1 - normalizedAlpha) * slowOutputsShare,
  );

  return { marketImpactInstant, marketImpactSlow };
};
