import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
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
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ min: '2025-08-27T19:25:00.048Z' }),
  };
  const create = jest.fn((value: VariantHistory) => value);
  const save = jest.fn().mockResolvedValue([]);
  const query = jest.fn().mockResolvedValue([
    {
      bucket: new Date('2026-01-01T00:00:00.000Z'),
      low_profit: 10,
      high_profit: 20,
    },
  ]);
  const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

  return {
    repo: {
      create,
      save,
      query,
      createQueryBuilder,
    } as unknown as Repository<VariantHistory>,
    create,
    save,
    query,
    createQueryBuilder,
  };
};

const createDailyHistoryRepo = () => {
  const query = jest.fn().mockResolvedValue([
    {
      bucket: new Date('2026-01-01T00:00:00.000Z'),
      low_profit: 30,
      high_profit: 60,
    },
  ]);

  return {
    repo: {
      query,
    } as unknown as Repository<VariantHistoryDaily>,
    query,
  };
};

const createService = () => {
  const historyRepo = createHistoryRepo();
  const dailyHistoryRepo = createDailyHistoryRepo();
  const snapshotRepo = createSnapshotRepo();
  const service = new VariantHistoryService(historyRepo.repo, dailyHistoryRepo.repo, snapshotRepo, {
    get: jest.fn().mockReturnValue('redis://localhost:6379'),
  } as unknown as ConfigService);

  return { service, historyRepo, dailyHistoryRepo };
};

describe('VariantHistoryService', () => {
  beforeEach(() => {
    redisCall.mockReset();
  });

  it('uses daily history for 1y average history', async () => {
    const { service, historyRepo, dailyHistoryRepo } = createService();

    const result = await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_1Y,
      granularity: HistoryGranularity.AUTO,
    });

    expect(dailyHistoryRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history_daily'),
      expect.any(Array),
    );
    expect(historyRepo.query).not.toHaveBeenCalled();
    expect(result.history).toEqual([
      {
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        lowProfit: 30,
        highProfit: 60,
      },
    ]);
  });

  it('uses daily history for all-time average history', async () => {
    const { service, historyRepo, dailyHistoryRepo } = createService();

    await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_ALL,
      granularity: HistoryGranularity.AUTO,
    });

    expect(historyRepo.createQueryBuilder).toHaveBeenCalled();
    expect(dailyHistoryRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history_daily'),
      expect.any(Array),
    );
    expect(historyRepo.query).not.toHaveBeenCalled();
  });

  it('falls back to raw history for a non-default timezone', async () => {
    const { service, historyRepo, dailyHistoryRepo } = createService();

    await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_1Y,
      granularity: HistoryGranularity.DAY_1,
      tz: 'UTC',
    });

    expect(dailyHistoryRepo.query).not.toHaveBeenCalled();
    expect(historyRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history'),
      expect.any(Array),
    );
  });

  it('falls back to raw history for 24h history', async () => {
    const { service, historyRepo, dailyHistoryRepo } = createService();

    await service.getHistory('variant-1', {
      range: HistoryRange.RANGE_24H,
      granularity: HistoryGranularity.AUTO,
    });

    expect(dailyHistoryRepo.query).not.toHaveBeenCalled();
    expect(historyRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM variant_history'),
      expect.any(Array),
    );
  });

  it('upserts daily history when capturing raw snapshots', async () => {
    const { service, historyRepo, dailyHistoryRepo } = createService();
    redisCall.mockResolvedValue([
      'method-1',
      JSON.stringify({
        'variant-1': { low: 100, high: 200 },
      }),
    ]);

    await service.capture();

    expect(historyRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        variant: { id: 'variant-1' },
        lowProfit: 100,
        highProfit: 200,
      }),
    ]);
    expect(dailyHistoryRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (variant_id, bucket_date) DO UPDATE SET'),
      ['variant-1', expect.any(Date), 100, 200],
    );
  });
});
