import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { VariantHistory15m } from '../methods/entities/variant-history-15m.entity';
import { VariantHistoryDaily } from '../methods/entities/variant-history-daily.entity';
import { VariantHistory } from '../methods/entities/variant-history.entity';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';
import { HistoryGranularity, HistoryRange } from './dto/variant-history-query.dto';
import { VariantHistoryService } from './variant-history.service';

const redisCall = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ call: redisCall })),
}));

const setDefaultRedisBehavior = () => {
  redisCall.mockImplementation((command: string) => {
    if (command === 'SET') return Promise.resolve('OK');
    if (command === 'EVAL') return Promise.resolve(1);
    if (command === 'HGETALL') return Promise.resolve([]);
    return Promise.resolve(null);
  });
};

const createDeleteQueryBuilder = (execute = jest.fn().mockResolvedValue({ affected: 0 })) => ({
  delete: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute,
});

const createSnapshotRepo = (): Repository<VariantSnapshot> => {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  return {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  } as unknown as Repository<VariantSnapshot>;
};

const createHistoryRepo = () => {
  const deleteQueryBuilder = createDeleteQueryBuilder();
  const create = jest.fn((value: VariantHistory) => value);
  const save = jest.fn().mockResolvedValue([]);
  const query = jest.fn().mockResolvedValue([
    {
      bucket: new Date('2026-01-01T00:00:00.000Z'),
      low_profit: 10,
      high_profit: 20,
    },
  ]);
  const createQueryBuilder = jest
    .fn()
    .mockImplementation((alias?: string) => (alias ? {} : deleteQueryBuilder));

  return {
    repo: {
      create,
      save,
      query,
      createQueryBuilder,
    } as unknown as Repository<VariantHistory>,
    save,
    query,
    createQueryBuilder,
    deleteExecute: deleteQueryBuilder.execute,
  };
};

const create15mHistoryRepo = () => {
  const deleteQueryBuilder = createDeleteQueryBuilder();
  const query = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('RETURNING')) {
      return Promise.resolve([{ inserted_count: 1, updated_count: 0 }]);
    }

    if (sql.includes('FROM variant_history_15m')) {
      return Promise.resolve([
        {
          bucket: new Date('2026-01-01T00:00:00.000Z'),
          low_profit: 20,
          high_profit: 40,
        },
      ]);
    }

    return Promise.resolve([]);
  });
  const createQueryBuilder = jest.fn().mockReturnValue(deleteQueryBuilder);

  return {
    repo: {
      query,
      createQueryBuilder,
    } as unknown as Repository<VariantHistory15m>,
    query,
    createQueryBuilder,
    deleteExecute: deleteQueryBuilder.execute,
  };
};

const createDailyHistoryRepo = (min = '2025-08-27T00:00:00.000Z') => {
  const query = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes("SELECT MIN(bucket_date::timestamp AT TIME ZONE 'UTC') AS min")) {
      return Promise.resolve([{ min }]);
    }

    if (sql.includes('RETURNING')) {
      return Promise.resolve([{ inserted_count: 1, updated_count: 0 }]);
    }

    if (sql.includes('FROM variant_history_daily')) {
      return Promise.resolve([
        {
          bucket: new Date('2026-01-01T00:00:00.000Z'),
          low_profit: 30,
          high_profit: 60,
        },
      ]);
    }

    return Promise.resolve([]);
  });

  return {
    repo: {
      query,
    } as unknown as Repository<VariantHistoryDaily>,
    query,
  };
};

const createService = (
  env: Record<string, string | undefined> = {},
  dailyMin = '2025-08-27T00:00:00.000Z',
) => {
  const historyRepo = createHistoryRepo();
  const history15mRepo = create15mHistoryRepo();
  const dailyHistoryRepo = createDailyHistoryRepo(dailyMin);
  const snapshotRepo = createSnapshotRepo();
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      return env[key];
    }),
  } as unknown as ConfigService;

  const service = new VariantHistoryService(
    historyRepo.repo,
    history15mRepo.repo,
    dailyHistoryRepo.repo,
    snapshotRepo,
    config,
  );

  return { service, historyRepo, history15mRepo, dailyHistoryRepo };
};

describe('VariantHistoryService', () => {
  beforeEach(() => {
    redisCall.mockReset();
    setDefaultRedisBehavior();
  });

  it('uses weighted daily history for 1y average history', async () => {
    const { service, historyRepo, history15mRepo, dailyHistoryRepo } = createService();

    const result = await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_1Y,
      granularity: HistoryGranularity.AUTO,
    });

    expect(dailyHistoryRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('SUM(low_profit_sum) / NULLIF(SUM(samples), 0)'),
      expect.any(Array),
    );
    expect(historyRepo.query).not.toHaveBeenCalled();
    expect(history15mRepo.query).not.toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history_15m'),
      expect.any(Array),
    );
    expect(result.history).toEqual([
      {
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        lowProfit: 30,
        highProfit: 60,
      },
    ]);
  });

  it('uses daily history for long ranges even with a non-default timezone', async () => {
    const { service, historyRepo, history15mRepo, dailyHistoryRepo } = createService();

    await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_1Y,
      granularity: HistoryGranularity.DAY_1,
      tz: 'UTC',
    });

    expect(dailyHistoryRepo.query).toHaveBeenCalledWith(
      expect.stringContaining("AT TIME ZONE 'UTC'"),
      expect.any(Array),
    );
    expect(historyRepo.query).not.toHaveBeenCalled();
    expect(history15mRepo.query).not.toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history_15m'),
      expect.any(Array),
    );
  });

  it('uses 15m history for 1w auto granularity', async () => {
    const { service, historyRepo, history15mRepo, dailyHistoryRepo } = createService();

    const result = await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_1W,
      granularity: HistoryGranularity.AUTO,
    });

    expect(history15mRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history_15m'),
      expect.any(Array),
    );
    expect(historyRepo.query).not.toHaveBeenCalled();
    expect(dailyHistoryRepo.query).not.toHaveBeenCalled();
    expect(result.history).toEqual([
      {
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        lowProfit: 20,
        highProfit: 40,
      },
    ]);
  });

  it('uses daily history for all-time and does not read the raw minimum timestamp', async () => {
    const { service, historyRepo, history15mRepo, dailyHistoryRepo } = createService();

    await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_ALL,
      granularity: HistoryGranularity.AUTO,
    });

    expect(dailyHistoryRepo.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT MIN(bucket_date::timestamp AT TIME ZONE 'UTC') AS min"),
      ['variant-1'],
    );
    expect(historyRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(history15mRepo.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT MIN(bucket_start) AS min'),
      expect.any(Array),
    );
  });

  it('falls back to raw history for 24h history', async () => {
    const { service, historyRepo, history15mRepo, dailyHistoryRepo } = createService();

    await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_24H,
      granularity: HistoryGranularity.AUTO,
    });

    expect(dailyHistoryRepo.query).not.toHaveBeenCalled();
    expect(history15mRepo.query).not.toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history_15m'),
      expect.any(Array),
    );
    expect(historyRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history'),
      expect.any(Array),
    );
  });

  it('upserts 15m and daily history when capturing raw snapshots', async () => {
    const { service, historyRepo, history15mRepo, dailyHistoryRepo } = createService();
    redisCall.mockImplementation((command: string) => {
      if (command === 'SET') return Promise.resolve('OK');
      if (command === 'EVAL') return Promise.resolve(1);
      if (command === 'HGETALL') {
        return Promise.resolve([
          'method-1',
          JSON.stringify({
            'variant-1': { low: 100, high: 200 },
          }),
        ]);
      }
      return Promise.resolve(null);
    });

    await service.capture();

    expect(historyRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        variant: { id: 'variant-1' },
        lowProfit: 100,
        highProfit: 200,
      }),
    ]);
    expect(history15mRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (variant_id, bucket_start) DO UPDATE SET'),
      ['variant-1', expect.any(Date), 100, 200],
    );
    expect(dailyHistoryRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (variant_id, bucket_date) DO UPDATE SET'),
      ['variant-1', expect.any(Date), 100, 200],
    );
  });

  it('skips capture when another instance holds the lock', async () => {
    const { service, historyRepo } = createService();
    redisCall.mockImplementation((command: string) => {
      if (command === 'SET') return Promise.resolve(null);
      if (command === 'EVAL') return Promise.resolve(1);
      if (command === 'HGETALL') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    await service.capture();

    expect(historyRepo.save).not.toHaveBeenCalled();
  });

  it('does not prune when pruning is disabled', async () => {
    const { service, historyRepo, history15mRepo } = createService();

    await service.pruneHistory();

    expect(historyRepo.deleteExecute).not.toHaveBeenCalled();
    expect(history15mRepo.deleteExecute).not.toHaveBeenCalled();
  });

  it('prunes raw and 15m history when pruning is enabled', async () => {
    const { service, historyRepo, history15mRepo } = createService({
      VARIANT_HISTORY_PRUNE_ENABLED: 'true',
      VARIANT_HISTORY_RAW_RETENTION_HOURS: '72',
      VARIANT_HISTORY_15M_RETENTION_DAYS: '90',
    });

    await service.pruneHistory();

    expect(historyRepo.createQueryBuilder).toHaveBeenCalledWith();
    expect(history15mRepo.createQueryBuilder).toHaveBeenCalledWith();
    expect(historyRepo.deleteExecute).toHaveBeenCalled();
    expect(history15mRepo.deleteExecute).toHaveBeenCalled();
  });
});
