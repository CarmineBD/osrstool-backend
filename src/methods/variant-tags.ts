const HOURS_IN_DAY = 24;
const GE_WINDOW_HOURS = 4;
const HIGH_INVESTMENT_THRESHOLD_GP = 10_000_000;
const VERY_SLOW_MARKET_IMPACT_THRESHOLD = 24;

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const VARIANT_TAG_LABEL_BY_QUERY_VALUE = {
  ge_limits: 'GE limits',
  high_investment_required: 'High investment required',
  risky_to_lose_money: 'Risky to lose money',
  not_viable: 'Not viable',
  safe: 'Safe',
  very_slow_to_buy_inputs: 'Very Slow to buy inputs',
  very_slow_to_sell_outputs: 'Very Slow to sell outputs',
} as const;

export type VariantTagQueryValue = keyof typeof VARIANT_TAG_LABEL_BY_QUERY_VALUE;

const VARIANT_TAG_SEVERITY_BY_QUERY_VALUE: Record<VariantTagQueryValue, 1 | 2 | 3> = {
  ge_limits: 2,
  high_investment_required: 2,
  risky_to_lose_money: 3,
  not_viable: 3,
  safe: 1,
  very_slow_to_buy_inputs: 2,
  very_slow_to_sell_outputs: 2,
};

export interface VariantTagDefinition {
  key: VariantTagQueryValue;
  label: string;
  severity: 1 | 2 | 3;
  description: string;
}

const VARIANT_TAG_DESCRIPTION_BY_QUERY_VALUE: Record<VariantTagQueryValue, string> = {
  ge_limits: 'Some required inputs exceed Grand Exchange buy limits at the one-hour scale.',
  high_investment_required:
    "This method requires a high upfront investment. One hour of inputs costs more than the method's best-case hourly profit.",
  risky_to_lose_money:
    'This method can be profitable in the best case, but it can lose money in the worst case.',
  not_viable:
    'This method has extreme market impact. Operating it at the one-hour scale may take days to fully buy and sell through the market.',
  safe: 'This method stayed above break-even over the last 24 hours.',
  very_slow_to_buy_inputs:
    'Buying the required inputs may take a long time because hourly demand is much higher than market volume.',
  very_slow_to_sell_outputs:
    'Selling the generated outputs may take a long time because hourly supply is much higher than market volume.',
};

export const VARIANT_TAG_QUERY_VALUES = Object.keys(
  VARIANT_TAG_LABEL_BY_QUERY_VALUE,
) as VariantTagQueryValue[];

export const VARIANT_TAG_DEFINITIONS: VariantTagDefinition[] = VARIANT_TAG_QUERY_VALUES.map(
  (key) => ({
    key,
    label: VARIANT_TAG_LABEL_BY_QUERY_VALUE[key],
    severity: VARIANT_TAG_SEVERITY_BY_QUERY_VALUE[key],
    description: VARIANT_TAG_DESCRIPTION_BY_QUERY_VALUE[key],
  }),
);

const VARIANT_TAG_DEFINITION_BY_QUERY_VALUE = new Map<VariantTagQueryValue, VariantTagDefinition>(
  VARIANT_TAG_DEFINITIONS.map((definition) => [definition.key, definition]),
);

const VARIANT_TAG_QUERY_VALUE_BY_LABEL = new Map<string, VariantTagQueryValue>(
  Object.entries(VARIANT_TAG_LABEL_BY_QUERY_VALUE).map(([queryValue, label]) => [
    label,
    queryValue as VariantTagQueryValue,
  ]),
);

const getVariantTagDefinition = (queryValue: VariantTagQueryValue): VariantTagDefinition =>
  VARIANT_TAG_DEFINITION_BY_QUERY_VALUE.get(queryValue) ?? {
    key: queryValue,
    label: VARIANT_TAG_LABEL_BY_QUERY_VALUE[queryValue],
    severity: VARIANT_TAG_SEVERITY_BY_QUERY_VALUE[queryValue],
    description: VARIANT_TAG_DESCRIPTION_BY_QUERY_VALUE[queryValue],
  };

export const getVariantTagQueryValue = (label: string): VariantTagQueryValue | undefined =>
  VARIANT_TAG_QUERY_VALUE_BY_LABEL.get(label);

export interface VariantTag {
  label: string;
  description: string;
  severity: 1 | 2 | 3;
}

export interface VariantTagVariantItem {
  id: number;
  quantity: number;
}

export interface VariantTagVariant {
  inputs: VariantTagVariantItem[];
  outputs: VariantTagVariantItem[];
}

export interface VariantTagPrice {
  high?: number;
  low?: number;
}

export interface VariantTagVolume24h {
  high24h?: number;
  low24h?: number;
}

export interface VariantTagItemMetadata {
  name?: string | null;
  buyLimit?: number | null;
}

export interface VariantSafety24hStats {
  minLowProfit: number;
  minHighProfit: number;
  sampleCount: number;
}

export interface BuildVariantTagsInput {
  variant: VariantTagVariant;
  pricesByItem: Record<number, VariantTagPrice>;
  volumes24hByItem: Record<number, VariantTagVolume24h>;
  itemMetadataById: Record<number, VariantTagItemMetadata>;
  lowProfit: number;
  highProfit: number;
  inputMarketImpactInstant: number;
  inputMarketImpactSlow: number;
  outputMarketImpactInstant: number;
  outputMarketImpactSlow: number;
  marketImpactInstant: number;
  marketImpactSlow: number;
  safety24h?: VariantSafety24hStats | null;
}

interface SideVolumeDetail {
  itemId: number;
  itemName: string;
  quantity: number;
  instantVolumePerHour: number | null;
  slowVolumePerHour: number | null;
  instantShare: number;
  slowShare: number;
}

const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const toPositiveNumberOrNull = (value: unknown): number | null => {
  const parsed = toFiniteNumberOrNull(value);
  if (parsed == null || parsed <= 0) return null;
  return parsed;
};

const formatWholeNumber = (value: number): string => integerFormatter.format(Math.round(value));

const formatGp = (value: number): string => `${formatWholeNumber(value)} GP`;

const formatDays = (value: number): string => {
  const formatted = decimalFormatter.format(value);
  return `${formatted} ${value === 1 ? 'day' : 'days'}`;
};

const getItemName = (
  itemId: number,
  itemMetadataById: Record<number, VariantTagItemMetadata>,
): string => {
  const name = itemMetadataById[itemId]?.name?.trim();
  return name && name.length > 0 ? name : `Item ${itemId}`;
};

const getInputUnitCost = (
  itemId: number,
  pricesByItem: Record<number, VariantTagPrice>,
): number => {
  const price = pricesByItem[itemId];
  if (!price) return 0;

  const high = toFiniteNumberOrNull(price.high);
  const low = toFiniteNumberOrNull(price.low);
  return Math.max(high ?? 0, low ?? 0, 0);
};

const getVolumePerHour = (
  side: 'input' | 'output',
  mode: 'instant' | 'slow',
  itemId: number,
  volumes24hByItem: Record<number, VariantTagVolume24h>,
): number | null => {
  const volume = volumes24hByItem[itemId];
  if (!volume) return null;

  const raw =
    side === 'input'
      ? mode === 'instant'
        ? toPositiveNumberOrNull(volume.high24h)
        : toPositiveNumberOrNull(volume.low24h)
      : mode === 'instant'
        ? toPositiveNumberOrNull(volume.low24h)
        : toPositiveNumberOrNull(volume.high24h);

  if (raw == null) return null;
  return raw / HOURS_IN_DAY;
};

const getShareFromVolumePerHour = (quantity: number, volumePerHour: number | null): number => {
  const normalizedQuantity = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
  if (normalizedQuantity === 0) return 0;
  if (volumePerHour == null) return 1;
  return normalizedQuantity / Math.max(1, volumePerHour);
};

const buildSideVolumeDetails = (
  items: VariantTagVariantItem[],
  side: 'input' | 'output',
  volumes24hByItem: Record<number, VariantTagVolume24h>,
  itemMetadataById: Record<number, VariantTagItemMetadata>,
): SideVolumeDetail[] =>
  items
    .map((item) => {
      const quantity = Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
      const instantVolumePerHour = getVolumePerHour(side, 'instant', item.id, volumes24hByItem);
      const slowVolumePerHour = getVolumePerHour(side, 'slow', item.id, volumes24hByItem);

      return {
        itemId: item.id,
        itemName: getItemName(item.id, itemMetadataById),
        quantity,
        instantVolumePerHour,
        slowVolumePerHour,
        instantShare: getShareFromVolumePerHour(quantity, instantVolumePerHour),
        slowShare: getShareFromVolumePerHour(quantity, slowVolumePerHour),
      };
    })
    .filter((detail) => detail.quantity > 0)
    .sort((a, b) => Math.max(b.instantShare, b.slowShare) - Math.max(a.instantShare, a.slowShare));

const buildVolumeBullet = (detail: SideVolumeDetail): string => {
  const requiredPerHour = formatWholeNumber(detail.quantity);

  if (detail.instantVolumePerHour == null || detail.slowVolumePerHour == null) {
    return `- ${detail.itemName} requires ${requiredPerHour}/hour, but 24h volume data is incomplete.`;
  }

  return `- ${detail.itemName} requires ${requiredPerHour}/hour, versus about ${formatWholeNumber(
    detail.instantVolumePerHour,
  )}/hour traded instantly and ${formatWholeNumber(detail.slowVolumePerHour)}/hour traded slowly.`;
};

export const buildVariantTags = ({
  variant,
  pricesByItem,
  volumes24hByItem,
  itemMetadataById,
  lowProfit,
  highProfit,
  inputMarketImpactInstant,
  inputMarketImpactSlow,
  outputMarketImpactInstant,
  outputMarketImpactSlow,
  marketImpactInstant,
  marketImpactSlow,
  safety24h,
}: BuildVariantTagsInput): VariantTag[] => {
  const tags: VariantTag[] = [];

  const geLimitedInputs = variant.inputs
    .map((input) => {
      const quantity = Number.isFinite(input.quantity) ? Math.max(0, input.quantity) : 0;
      const buyLimit = toPositiveNumberOrNull(itemMetadataById[input.id]?.buyLimit);
      if (quantity === 0 || buyLimit == null) return null;

      const hourlyLimit = buyLimit / GE_WINDOW_HOURS;
      if (quantity <= hourlyLimit) return null;

      return {
        itemName: getItemName(input.id, itemMetadataById),
        quantity,
        buyLimit,
        hourlyLimit,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  if (geLimitedInputs.length > 0) {
    const tagDefinition = getVariantTagDefinition('ge_limits');
    tags.push({
      label: tagDefinition.label,
      severity: tagDefinition.severity,
      description: [
        'Some required inputs exceed Grand Exchange buy limits.',
        ...geLimitedInputs.map(
          (item) =>
            `- ${item.itemName} requires ${formatWholeNumber(
              item.quantity,
            )}/hour, while the GE buy limit is ${formatWholeNumber(
              item.buyLimit,
            )} every 4 hours (${formatWholeNumber(item.hourlyLimit)}/hour).`,
        ),
      ].join('\n'),
    });
  }

  const totalInputCost = variant.inputs.reduce((sum, input) => {
    const quantity = Number.isFinite(input.quantity) ? Math.max(0, input.quantity) : 0;
    return sum + getInputUnitCost(input.id, pricesByItem) * quantity;
  }, 0);

  if (
    totalInputCost > HIGH_INVESTMENT_THRESHOLD_GP &&
    Number.isFinite(highProfit) &&
    totalInputCost > highProfit
  ) {
    const tagDefinition = getVariantTagDefinition('high_investment_required');
    tags.push({
      label: tagDefinition.label,
      severity: tagDefinition.severity,
      description: `This method requires a high upfront investment. One hour of inputs costs about ${formatGp(
        totalInputCost,
      )}, which is higher than the method's best-case hourly profit of ${formatGp(highProfit)}.`,
    });
  }

  if (
    Number.isFinite(lowProfit) &&
    Number.isFinite(highProfit) &&
    lowProfit < 0 &&
    highProfit > 0
  ) {
    const tagDefinition = getVariantTagDefinition('risky_to_lose_money');
    tags.push({
      label: tagDefinition.label,
      severity: tagDefinition.severity,
      description:
        'This method can be profitable in the best case, but it can lose money in the worst case. Use caution.',
    });
  }

  if (
    marketImpactInstant > VERY_SLOW_MARKET_IMPACT_THRESHOLD &&
    marketImpactSlow > VERY_SLOW_MARKET_IMPACT_THRESHOLD
  ) {
    const bestCaseDays = Math.min(marketImpactInstant, marketImpactSlow) / HOURS_IN_DAY;
    const tagDefinition = getVariantTagDefinition('not_viable');
    tags.push({
      label: tagDefinition.label,
      severity: tagDefinition.severity,
      description: `This method has extreme market impact. Even in the best case, operating at this one-hour scale may require about ${formatDays(
        bestCaseDays,
      )} to fully buy and sell through the market.`,
    });
  }

  if (
    safety24h &&
    safety24h.sampleCount > 0 &&
    safety24h.minLowProfit >= 0 &&
    safety24h.minHighProfit >= 0
  ) {
    const tagDefinition = getVariantTagDefinition('safe');
    tags.push({
      label: tagDefinition.label,
      severity: tagDefinition.severity,
      description:
        'This method has stayed above break-even over the last 24 hours. Neither low profit nor high profit dropped below 0 GP.',
    });
  }

  if (
    inputMarketImpactInstant > VERY_SLOW_MARKET_IMPACT_THRESHOLD &&
    inputMarketImpactSlow > VERY_SLOW_MARKET_IMPACT_THRESHOLD
  ) {
    const inputBullets = buildSideVolumeDetails(
      variant.inputs,
      'input',
      volumes24hByItem,
      itemMetadataById,
    ).map(buildVolumeBullet);

    const tagDefinition = getVariantTagDefinition('very_slow_to_buy_inputs');
    tags.push({
      label: tagDefinition.label,
      severity: tagDefinition.severity,
      description: [
        'The required input quantities are much higher than the market trades per hour, so buying inputs may take a long time at this scale.',
        ...inputBullets,
      ].join('\n'),
    });
  }

  if (
    outputMarketImpactInstant > VERY_SLOW_MARKET_IMPACT_THRESHOLD &&
    outputMarketImpactSlow > VERY_SLOW_MARKET_IMPACT_THRESHOLD
  ) {
    const outputBullets = buildSideVolumeDetails(
      variant.outputs,
      'output',
      volumes24hByItem,
      itemMetadataById,
    ).map(buildVolumeBullet);

    const tagDefinition = getVariantTagDefinition('very_slow_to_sell_outputs');
    tags.push({
      label: tagDefinition.label,
      severity: tagDefinition.severity,
      description: [
        'The generated output quantities are much higher than the market trades per hour, so selling outputs may take a long time at this scale.',
        ...outputBullets,
      ].join('\n'),
    });
  }

  return tags;
};
