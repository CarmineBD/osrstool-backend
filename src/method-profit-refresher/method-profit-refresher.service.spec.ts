const redisCall = jest.fn<void, [string, string, string, string]>();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ call: redisCall })),
  __call: redisCall,
}));

import { MethodProfitRefresherService } from './method-profit-refresher.service';

describe('MethodProfitRefresherService', () => {
  beforeEach(() => {
    redisCall.mockReset();
  });

  it('computes and stores profits per variant', async () => {
    const methodsService = {
      findAll: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'm1',
            variants: [
              {
                id: 'v1',
                inputs: [{ id: 100, quantity: 2 }],
                outputs: [{ id: 200, quantity: 3 }],
              },
            ],
          },
        ],
      }),
    };

    const pricesService = {
      getMany: jest.fn().mockResolvedValue({
        100: { low: 10, high: 12 },
        200: { low: 20, high: 25 },
      }),
    };

    const service = new MethodProfitRefresherService(
      methodsService as unknown as { findAll: () => Promise<{ data: unknown[] }> },
      pricesService as unknown as { getMany: (ids: number[]) => Promise<Record<number, unknown>> },
    );

    await service.refresh();

    expect(redisCall).toHaveBeenCalledTimes(1);
    const payload = redisCall.mock.calls[0]?.[3] ?? '{}';
    const parsed = JSON.parse(payload) as {
      m1: { v1: { low: number; high: number } };
    };
    expect(parsed.m1.v1.low).toBe(36);
    expect(parsed.m1.v1.high).toBe(55);
  });
});
