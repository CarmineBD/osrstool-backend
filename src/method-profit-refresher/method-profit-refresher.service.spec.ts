const redisCall = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ call: redisCall })),
  __call: redisCall,
}));

import { MethodProfitRefresherService } from './method-profit-refresher.service';
import type { MethodsService } from '../methods/methods.service';
import type { PricesService } from '../prices/prices.service';
import type { ConfigService } from '@nestjs/config';

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
    const configService = {
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    };

    const service = new MethodProfitRefresherService(
      methodsService as unknown as MethodsService,
      pricesService as unknown as PricesService,
      configService as unknown as ConfigService,
    );

    await service.refresh();

    expect(redisCall).toHaveBeenCalledTimes(2);
    const calls = redisCall.mock.calls as unknown[][];
    expect(calls[0]).toEqual(['DEL', 'methods:profits']);
    const hsetCall = calls[1] ?? [];
    expect(hsetCall[0]).toBe('HSET');
    expect(hsetCall[1]).toBe('methods:profits');
    expect(hsetCall[2]).toBe('m1');
    const payload = typeof hsetCall[3] === 'string' ? hsetCall[3] : '{}';
    const parsed = JSON.parse(payload) as unknown as {
      v1: { low: number; high: number };
    };
    expect(parsed.v1.low).toBe(36);
    expect(parsed.v1.high).toBe(55);
  });
});
