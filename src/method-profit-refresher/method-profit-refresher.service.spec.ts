const redisCall = jest.fn();
const redisMulti = jest.fn();
const redisTransactionCall = jest.fn();
const redisTransactionExec = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ call: redisCall, multi: redisMulti })),
  __call: redisCall,
}));

import { MethodProfitRefresherService } from './method-profit-refresher.service';
import { METHODS_PROFITS_HASH_KEY } from '../methods/profit-cache.constants';
import type { MethodsService } from '../methods/methods.service';
import type { PricesService } from '../prices/prices.service';
import type { ConfigService } from '@nestjs/config';
import { CalculationMode } from '../methods/calculation-mode.enum';
import { ActionCondition } from '../methods/action-condition.enum';

describe('MethodProfitRefresherService', () => {
  beforeEach(() => {
    redisCall.mockReset();
    redisMulti.mockReset();
    redisTransactionCall.mockReset();
    redisTransactionExec.mockReset();
    redisTransactionExec.mockResolvedValue([]);
    redisMulti.mockReturnValue({ call: redisTransactionCall, exec: redisTransactionExec });
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

    expect(redisMulti).toHaveBeenCalledTimes(1);
    expect(redisTransactionCall).toHaveBeenCalledTimes(3);
    const calls = redisTransactionCall.mock.calls as unknown[][];
    const hsetCall = calls[1] ?? [];
    expect(hsetCall[0]).toBe('HSET');
    expect(hsetCall[1]).toMatch(new RegExp(`^${METHODS_PROFITS_HASH_KEY}:refresh:`));
    expect(hsetCall[2]).toBe('m1');
    const payload = typeof hsetCall[3] === 'string' ? hsetCall[3] : '{}';
    const parsed = JSON.parse(payload) as unknown as {
      v1: { low: number; high: number };
    };
    expect(parsed.v1.low).toBe(36);
    expect(parsed.v1.high).toBe(55);
    expect(calls[2]).toEqual(['RENAME', hsetCall[1], METHODS_PROFITS_HASH_KEY]);
    expect(redisTransactionExec).toHaveBeenCalledTimes(1);
  });

  it('skips scheduled refresh when SCHEDULED_JOBS_ENABLED is false', async () => {
    const methodsService = {
      findAll: jest.fn(),
    };
    const pricesService = {
      getMany: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'REDIS_URL') return 'redis://localhost:6379';
        if (key === 'SCHEDULED_JOBS_ENABLED') return 'false';
        return undefined;
      }),
    };

    const service = new MethodProfitRefresherService(
      methodsService as unknown as MethodsService,
      pricesService as unknown as PricesService,
      configService as unknown as ConfigService,
    );

    await service.handleRefreshCron();

    expect(methodsService.findAll).not.toHaveBeenCalled();
    expect(pricesService.getMany).not.toHaveBeenCalled();
    expect(redisCall).not.toHaveBeenCalled();
  });

  it('stores a 100% success-chance profit specifically for dynamic history', async () => {
    const methodsService = {
      findAll: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'm1',
            variants: [
              {
                id: 'v1',
                calculationMode: CalculationMode.DYNAMIC,
                inputs: [{ id: 100, quantity: 750 }],
                outputs: [{ id: 200, quantity: 750 }],
                action: {
                  id: 'action-1',
                  name: 'Open chest',
                  rollIntervalTicks: 6,
                  baseSuccessChance: 0.75,
                  inputs: [{ id: 100, quantity: 1, condition: ActionCondition.ALWAYS }],
                  outputs: [
                    { id: 200, quantity: 1, condition: ActionCondition.SUCCESS },
                    { id: 300, quantity: 1, condition: ActionCondition.FAILURE },
                  ],
                  xpGained: [],
                },
                cycleSteps: [
                  {
                    name: 'Open',
                    stepOrderPosition: 1,
                    durationTicks: 6,
                    clicksMade: 1,
                    isAfk: false,
                    actionsMade: 1,
                  },
                ],
              },
            ],
          },
        ],
      }),
    };
    const pricesService = {
      getMany: jest.fn().mockResolvedValue({
        100: { low: 10, high: 12 },
        200: { low: 30, high: 35 },
        300: { low: 1, high: 1 },
      }),
    };
    const configService = { get: jest.fn().mockReturnValue('redis://localhost:6379') };
    const service = new MethodProfitRefresherService(
      methodsService as unknown as MethodsService,
      pricesService as unknown as PricesService,
      configService as unknown as ConfigService,
    );

    await service.refresh();

    const hsetCall = (redisTransactionCall.mock.calls as unknown[][])[1] ?? [];
    const parsed = JSON.parse(String(hsetCall[3])) as {
      v1: { low: number; high: number; historyLow: number; historyHigh: number };
    };
    expect(parsed.v1).toEqual({
      low: 13500,
      high: 18750,
      historyLow: 18000,
      historyHigh: 25000,
    });
  });
});
