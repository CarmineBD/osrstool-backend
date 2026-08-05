import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { PresenceHistoryRange } from './dto/presence-history-query.dto';
import { PresenceHistory } from './entities/presence-history.entity';
import { PresenceService } from './presence.service';

const createConfigService = (env: Record<string, string | undefined> = {}): ConfigService =>
  ({
    get: jest.fn((key: string) => env[key]),
  }) as unknown as ConfigService;

const createRedisMock = () => {
  const pipelineState: { results: Array<[Error | null, unknown]> | null } = {
    results: [],
  };

  const pipeline = {
    zremrangebyscore: jest.fn().mockReturnThis(),
    zcount: jest.fn().mockReturnThis(),
    exec: jest.fn().mockImplementation(() => Promise.resolve(pipelineState.results)),
  };

  const redis = {
    eval: jest.fn(),
    pipeline: jest.fn(() => pipeline),
    zremrangebyscore: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  };

  return { redis, pipeline, pipelineState };
};

const createDeleteBuilder = (result: { affected?: number }) => ({
  delete: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(result),
});

describe('PresenceService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const createService = (
    env: Record<string, string | undefined> = {},
    redisOverride?: ReturnType<typeof createRedisMock>['redis'],
    repoOverride?: Partial<Repository<PresenceHistory>>,
  ) => {
    const redisMock = redisOverride ?? createRedisMock().redis;
    const redisService = {
      getClient: jest.fn().mockReturnValue(redisMock),
    };
    const defaultHourDeleteBuilder = createDeleteBuilder({ affected: 0 });
    const defaultDayDeleteBuilder = createDeleteBuilder({ affected: 0 });
    const presenceHistoryRepo = {
      query: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(defaultHourDeleteBuilder)
        .mockReturnValueOnce(defaultDayDeleteBuilder),
      ...repoOverride,
    };

    const service = new PresenceService(
      createConfigService(env),
      redisService as never,
      presenceHistoryRepo as unknown as Repository<PresenceHistory>,
    );

    return {
      service,
      redisMock,
      redisService,
      presenceHistoryRepo,
      defaultHourDeleteBuilder,
      defaultDayDeleteBuilder,
    };
  };

  it('registers a heartbeat through a single Lua script and returns the online count', async () => {
    const { redis } = createRedisMock();
    redis.eval.mockResolvedValue(127);
    const { service } = createService({}, redis);
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T14:33:10.000Z'));

    const online = await service.recordHeartbeat({ visitorId: 'visitor-123' });

    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('ZCOUNT'"),
      2,
      'presence:online',
      'presence:peak:hour:2026-08-05T14:00:00.000Z',
      expect.any(String),
      expect.any(String),
      'visitor:visitor-123',
      String(96 * 60 * 60 * 1000),
    );
    expect(online).toBe(127);
    jest.useRealTimers();
  });

  it('counts online users while excluding expired entries', async () => {
    const { redis, pipeline, pipelineState } = createRedisMock();
    pipelineState.results = [
      [null, 3],
      [null, 42],
    ];
    const { service } = createService({ PRESENCE_TTL_SECONDS: '90' }, redis);

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(200_000);
    const online = await service.getOnlineCount();

    expect(pipeline.zremrangebyscore).toHaveBeenCalledWith('presence:online', '-inf', '(110000');
    expect(pipeline.zcount).toHaveBeenCalledWith('presence:online', 110000, '+inf');
    expect(online).toBe(42);
    nowSpy.mockRestore();
  });

  it('finalizes the last 72 closed hours, stores zeros for gaps, and only deletes persisted redis keys', async () => {
    const { redis } = createRedisMock();
    redis.get.mockImplementation((key: string) => {
      if (key === 'presence:peak:hour:2026-08-02T15:00:00.000Z') return '5';
      if (key === 'presence:peak:hour:2026-08-05T14:00:00.000Z') return '17';
      return null;
    });
    const repo = {
      query: jest.fn().mockResolvedValue([]),
    };
    const { service } = createService({}, redis, repo);

    await service.finalizeHourlyHistory(new Date('2026-08-05T15:10:00.000Z'));

    expect(redis.set).toHaveBeenCalledWith(
      'lock:presence:history:hourly-finalizer',
      expect.any(String),
      'PX',
      120_000,
      'NX',
    );
    expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('GREATEST'), [
      'hour',
      '2026-08-02T15:00:00.000Z',
      5,
    ]);
    expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('GREATEST'), [
      'hour',
      '2026-08-02T16:00:00.000Z',
      0,
    ]);
    expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('GREATEST'), [
      'hour',
      '2026-08-05T14:00:00.000Z',
      17,
    ]);
    expect(redis.del).toHaveBeenCalledWith('presence:peak:hour:2026-08-02T15:00:00.000Z');
    expect(redis.del).toHaveBeenCalledWith('presence:peak:hour:2026-08-05T14:00:00.000Z');
    expect(redis.del).not.toHaveBeenCalledWith('presence:peak:hour:2026-08-02T16:00:00.000Z');
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.stringContaining("redis.call('get', KEYS[1])"),
      1,
      'lock:presence:history:hourly-finalizer',
      expect.any(String),
    );
  });

  it('skips hourly finalization when the redis lock is already held', async () => {
    const { redis } = createRedisMock();
    redis.set.mockResolvedValue(null);
    const repo = {
      query: jest.fn().mockResolvedValue([]),
    };
    const { service } = createService({}, redis, repo);

    await service.finalizeHourlyHistory(new Date('2026-08-05T15:10:00.000Z'));

    expect(repo.query).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('rolls up the previous UTC day with GREATEST and runs cleanup only after success', async () => {
    const { redis } = createRedisMock();
    const repo = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ peak_online: '17' }])
        .mockResolvedValueOnce([]),
    };
    const { service } = createService({}, redis, repo);
    const privateService = service as unknown as {
      cleanupHistory: (
        referenceDate?: Date,
      ) => Promise<{ dayDeleted: number; hourDeleted: number }>;
    };
    const cleanupSpy = jest
      .spyOn(privateService, 'cleanupHistory')
      .mockResolvedValue({ dayDeleted: 1, hourDeleted: 2 });

    await service.rollupDailyHistory(new Date('2026-08-06T00:05:00.000Z'));

    expect(repo.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('COALESCE(MAX(peak_online), 0)'),
      ['2026-08-05T00:00:00.000Z', '2026-08-06T00:00:00.000Z'],
    );
    expect(repo.query).toHaveBeenNthCalledWith(2, expect.stringContaining('GREATEST'), [
      'day',
      '2026-08-05T00:00:00.000Z',
      17,
    ]);
    expect(cleanupSpy).toHaveBeenCalledWith(new Date('2026-08-06T00:05:00.000Z'));
  });

  it('does not run cleanup when the daily rollup upsert fails', async () => {
    const { redis } = createRedisMock();
    const repo = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ peak_online: '11' }])
        .mockRejectedValueOnce(new Error('db down')),
    };
    const { service } = createService({}, redis, repo);
    const privateService = service as unknown as {
      cleanupHistory: (
        referenceDate?: Date,
      ) => Promise<{ dayDeleted: number; hourDeleted: number }>;
    };
    const cleanupSpy = jest
      .spyOn(privateService, 'cleanupHistory')
      .mockResolvedValue({ dayDeleted: 0, hourDeleted: 0 });

    await expect(service.rollupDailyHistory(new Date('2026-08-06T00:05:00.000Z'))).rejects.toThrow(
      'db down',
    );
    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  it('applies hourly and daily retention boundaries during cleanup', async () => {
    const { redis } = createRedisMock();
    const hourDeleteBuilder = createDeleteBuilder({ affected: 4 });
    const dayDeleteBuilder = createDeleteBuilder({ affected: 2 });
    const repo = {
      query: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(hourDeleteBuilder)
        .mockReturnValueOnce(dayDeleteBuilder),
    };
    const { service } = createService({}, redis, repo);

    const privateService = service as unknown as {
      cleanupHistory: (
        referenceDate?: Date,
      ) => Promise<{ dayDeleted: number; hourDeleted: number }>;
    };
    const result = await privateService.cleanupHistory(new Date('2026-08-06T00:05:00.000Z'));

    expect(hourDeleteBuilder.andWhere).toHaveBeenCalledWith('bucket_start < :boundary', {
      boundary: '2026-08-03T00:00:00.000Z',
    });
    expect(dayDeleteBuilder.andWhere).toHaveBeenCalledWith('bucket_start < :boundary', {
      boundary: '2023-08-06T00:00:00.000Z',
    });
    expect(result).toEqual({ dayDeleted: 2, hourDeleted: 4 });
  });

  it('returns exactly 72 hourly points with zero fill and the current provisional bucket', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T15:23:00.000Z'));
    const { redis } = createRedisMock();
    redis.get.mockResolvedValue('9');
    const repo = {
      query: jest.fn().mockResolvedValue([
        { bucket_start: '2026-08-05T13:00:00.000Z', peak_online: 4 },
        { bucket_start: '2026-08-05T14:00:00.000Z', peak_online: 17 },
      ]),
    };
    const { service } = createService({}, redis, repo);

    const result = await service.getPresenceHistory(PresenceHistoryRange.RANGE_72H);

    expect(result.granularity).toBe('hour');
    expect(result.points).toHaveLength(72);
    expect(result.points[0]).toEqual({
      bucketStart: '2026-08-02T16:00:00.000Z',
      peakOnline: 0,
      provisional: false,
    });
    expect(result.points[69]).toEqual({
      bucketStart: '2026-08-05T13:00:00.000Z',
      peakOnline: 4,
      provisional: false,
    });
    expect(result.points[70]).toEqual({
      bucketStart: '2026-08-05T14:00:00.000Z',
      peakOnline: 17,
      provisional: false,
    });
    expect(result.points[71]).toEqual({
      bucketStart: '2026-08-05T15:00:00.000Z',
      peakOnline: 9,
      provisional: true,
    });
  });

  it('returns finalized daily history for 30d with zero fill', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-05T15:23:00.000Z'));
    const { redis } = createRedisMock();
    const repo = {
      query: jest.fn().mockResolvedValue([
        { bucket_start: '2026-07-10T00:00:00.000Z', peak_online: 8 },
        { bucket_start: '2026-08-04T00:00:00.000Z', peak_online: 19 },
      ]),
    };
    const { service } = createService({}, redis, repo);

    const result = await service.getPresenceHistory(PresenceHistoryRange.RANGE_30D);

    expect(result.granularity).toBe('day');
    expect(result.points).toHaveLength(30);
    expect(result.points[0]).toEqual({
      bucketStart: '2026-07-06T00:00:00.000Z',
      peakOnline: 0,
      provisional: false,
    });
    expect(result.points[4]).toEqual({
      bucketStart: '2026-07-10T00:00:00.000Z',
      peakOnline: 8,
      provisional: false,
    });
    expect(result.points[29]).toEqual({
      bucketStart: '2026-08-04T00:00:00.000Z',
      peakOnline: 19,
      provisional: false,
    });
  });

  it('logs and rethrows redis errors during heartbeat operations', async () => {
    const { redis } = createRedisMock();
    const redisError = new Error('redis down');
    redis.eval.mockRejectedValue(redisError);
    const { service } = createService({}, redis);
    const logger = (service as unknown as { logger: Logger }).logger;
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation();

    await expect(service.recordHeartbeat({ visitorId: 'visitor-1' })).rejects.toThrow('redis down');
    expect(loggerSpy).toHaveBeenCalledWith('Presence heartbeat failed', redisError.stack);
  });
});
