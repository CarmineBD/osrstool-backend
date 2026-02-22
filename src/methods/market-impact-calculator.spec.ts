import { calculateMarketImpact } from './market-impact-calculator';

describe('calculateMarketImpact', () => {
  it('calculates instant and slow impact for 1 input and 1 output', () => {
    const result = calculateMarketImpact({
      inputs: [{ id: 100, quantity: 50 }],
      outputs: [{ id: 200, quantity: 60 }],
      pricesByItem: {
        100: { high: 100, low: 90 },
        200: { high: 200, low: 180 },
      },
      volumes24hByItem: {
        100: { high24h: 2400, low24h: 4800 },
        200: { high24h: 1200, low24h: 2400 },
      },
    });

    expect(result.marketImpactInstant).toBeCloseTo(0.55, 6);
    expect(result.marketImpactSlow).toBeCloseTo(0.725, 6);
  });

  it('uses economic weighting across multiple items', () => {
    const result = calculateMarketImpact({
      inputs: [
        { id: 1, quantity: 10 },
        { id: 2, quantity: 1000 },
      ],
      outputs: [{ id: 3, quantity: 50 }],
      pricesByItem: {
        1: { high: 1000, low: 900 },
        2: { high: 1, low: 1 },
        3: { high: 100, low: 100 },
      },
      volumes24hByItem: {
        1: { high24h: 2400, low24h: 2400 },
        2: { high24h: 24000, low24h: 24000 },
        3: { high24h: 2400, low24h: 2400 },
      },
    });

    expect(result.marketImpactInstant).toBeCloseTo(0.340909, 5);
  });

  it('treats missing volume as max impact and handles zero volume with epsilon', () => {
    const result = calculateMarketImpact({
      inputs: [{ id: 10, quantity: 25 }],
      outputs: [{ id: 20, quantity: 2 }],
      pricesByItem: {
        10: { high: 100, low: 100 },
        20: { high: 200, low: 200 },
      },
      volumes24hByItem: {
        20: { high24h: 0, low24h: 0 },
      },
    });

    expect(result.marketImpactInstant).toBe(1.5);
    expect(result.marketImpactSlow).toBe(1.5);
  });

  it('does not clamp the upper bound and keeps lower bound at zero', () => {
    const uncappedResult = calculateMarketImpact({
      inputs: [{ id: 1, quantity: 100000 }],
      outputs: [{ id: 2, quantity: 100000 }],
      pricesByItem: {
        1: { high: 1000, low: 1000 },
        2: { high: 1000, low: 1000 },
      },
      volumes24hByItem: {
        1: { high24h: 1, low24h: 1 },
        2: { high24h: 1, low24h: 1 },
      },
    });

    const lowResult = calculateMarketImpact({
      inputs: [{ id: 1, quantity: -10 }],
      outputs: [{ id: 2, quantity: -5 }],
      pricesByItem: {},
      volumes24hByItem: {},
    });

    expect(uncappedResult.marketImpactInstant).toBeGreaterThan(1);
    expect(uncappedResult.marketImpactSlow).toBeGreaterThan(1);
    expect(lowResult.marketImpactInstant).toBe(0);
    expect(lowResult.marketImpactSlow).toBe(0);
  });
});
