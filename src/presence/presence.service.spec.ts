import { Logger } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
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
    zadd: jest.fn().mockReturnThis(),
    zcount: jest.fn().mockReturnThis(),
    exec: jest.fn().mockImplementation(() => Promise.resolve(pipelineState.results)),
  };

  const redis = {
    pipeline: jest.fn(() => pipeline),
    zremrangebyscore: jest.fn(),
  };

  return { redis, pipeline, pipelineState };
};

describe('PresenceService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const createService = (
    env: Record<string, string | undefined> = {},
    redisOverride?: ReturnType<typeof createRedisMock>['redis'],
  ) => {
    const redisMock = redisOverride ?? createRedisMock().redis;
    const redisService = {
      getClient: jest.fn().mockReturnValue(redisMock),
    };

    const service = new PresenceService(createConfigService(env), redisService as never);

    return { service, redisMock, redisService };
  };

  it('registers an anonymous visitor heartbeat and returns the online count', async () => {
    const { redis, pipeline, pipelineState } = createRedisMock();
    pipelineState.results = [
      [null, 0],
      [null, 1],
      [null, 127],
    ];
    const { service } = createService({}, redis);

    const online = await service.recordHeartbeat({
      visitorId: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(redis.pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.zremrangebyscore).toHaveBeenCalledWith(
      'presence:online',
      '-inf',
      expect.stringMatching(/^\(\d+$/),
    );
    expect(pipeline.zadd).toHaveBeenCalledWith(
      'presence:online',
      expect.any(Number),
      'visitor:550e8400-e29b-41d4-a716-446655440000',
    );
    expect(pipeline.zcount).toHaveBeenCalledWith('presence:online', expect.any(Number), '+inf');
    expect(online).toBe(127);
  });

  it('updates the same anonymous visitor without changing the member identity', async () => {
    const { redis, pipeline, pipelineState } = createRedisMock();
    pipelineState.results = [
      [null, 0],
      [null, 1],
      [null, 1],
    ];
    const { service } = createService({}, redis);

    await service.recordHeartbeat({ visitorId: 'same-visitor' });
    await service.recordHeartbeat({ visitorId: 'same-visitor' });

    expect(pipeline.zadd).toHaveBeenNthCalledWith(
      1,
      'presence:online',
      expect.any(Number),
      'visitor:same-visitor',
    );
    expect(pipeline.zadd).toHaveBeenNthCalledWith(
      2,
      'presence:online',
      expect.any(Number),
      'visitor:same-visitor',
    );
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

  it('cleans up expired presences', async () => {
    const { redis } = createRedisMock();
    redis.zremrangebyscore = jest.fn().mockResolvedValue(9);
    const { service } = createService({}, redis);

    const removed = await service.pruneExpiredPresence(250_000);

    expect(redis.zremrangebyscore).toHaveBeenCalledWith('presence:online', '-inf', '(160000');
    expect(removed).toBe(9);
  });

  it('rejects a heartbeat without visitorId when there is no authenticated user', async () => {
    const { service } = createService();

    await expect(service.recordHeartbeat({})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prioritizes the authenticated user id over visitorId when both are present', async () => {
    const { redis, pipeline, pipelineState } = createRedisMock();
    pipelineState.results = [
      [null, 0],
      [null, 1],
      [null, 7],
    ];
    const { service } = createService({}, redis);

    const online = await service.recordHeartbeat({
      authenticatedUserId: 'user-123',
      visitorId: 'visitor-123',
    });

    expect(pipeline.zadd).toHaveBeenCalledWith(
      'presence:online',
      expect.any(Number),
      'user:user-123',
    );
    expect(online).toBe(7);
  });

  it('logs and rethrows Redis errors during heartbeat operations', async () => {
    const { redis, pipeline } = createRedisMock();
    const redisError = new Error('redis down');
    pipeline.exec.mockRejectedValue(redisError);
    const { service } = createService({}, redis);
    const logger = (service as unknown as { logger: Logger }).logger;
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation();

    await expect(service.recordHeartbeat({ visitorId: 'visitor-1' })).rejects.toThrow('redis down');
    expect(loggerSpy).toHaveBeenCalledWith('Presence heartbeat failed', redisError.stack);
  });

  it('does not expose identifiers in the heartbeat result', async () => {
    const { redis, pipelineState } = createRedisMock();
    pipelineState.results = [
      [null, 0],
      [null, 1],
      [null, 5],
    ];
    const { service } = createService({}, redis);

    const result = await service.recordHeartbeat({ visitorId: 'visitor-1' });

    expect(result).toBe(5);
    expect((result as unknown as Record<string, unknown>).visitorId).toBeUndefined();
  });

  it('logs cron prune errors without throwing', async () => {
    const { service } = createService();
    const logger = (service as unknown as { logger: Logger }).logger;
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation();
    jest
      .spyOn(service, 'pruneExpiredPresence')
      .mockRejectedValue(new Error('temporary redis failure'));

    await expect(service.handlePresencePruneCron()).resolves.toBeUndefined();
    expect(loggerSpy).toHaveBeenCalledWith(
      'Presence prune cron failed',
      expect.stringContaining('temporary redis failure'),
    );
  });
});
