import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import IORedis, { Redis } from 'ioredis';
import { RedisService } from '../redis/redis.service';

interface PresenceIdentity {
  authenticatedUserId?: string | null;
  visitorId?: string;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly redis: Redis;
  private readonly presenceTtlSeconds: number;
  private readonly presenceRedisKey: string;

  constructor(
    private readonly config: ConfigService,
    @Optional() redisService?: RedisService,
  ) {
    this.redis =
      redisService?.getClient() ??
      new IORedis((this.config.get<string>('REDIS_URL') as string) ?? '');
    this.presenceTtlSeconds = this.parsePositiveIntEnv(
      this.config.get<string>('PRESENCE_TTL_SECONDS'),
      90,
    );
    this.presenceRedisKey =
      this.config.get<string>('PRESENCE_REDIS_KEY')?.trim() || 'presence:online';
  }

  async recordHeartbeat(identity: PresenceIdentity): Promise<number> {
    const member = this.resolveMember(identity);
    const nowMs = Date.now();
    const cutoffMs = this.getCutoffMs(nowMs);

    try {
      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(this.presenceRedisKey, '-inf', `(${cutoffMs}`);
      pipeline.zadd(this.presenceRedisKey, nowMs, member);
      pipeline.zcount(this.presenceRedisKey, cutoffMs, '+inf');

      const results = await pipeline.exec();
      return this.readIntegerResult(results, 2, 'heartbeat count');
    } catch (error) {
      this.logRedisError('heartbeat', error);
      throw error;
    }
  }

  async getOnlineCount(): Promise<number> {
    const nowMs = Date.now();
    const cutoffMs = this.getCutoffMs(nowMs);

    try {
      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(this.presenceRedisKey, '-inf', `(${cutoffMs}`);
      pipeline.zcount(this.presenceRedisKey, cutoffMs, '+inf');

      const results = await pipeline.exec();
      return this.readIntegerResult(results, 1, 'online count');
    } catch (error) {
      this.logRedisError('online count', error);
      throw error;
    }
  }

  @Cron('*/10 * * * *')
  async handlePresencePruneCron(): Promise<void> {
    try {
      await this.pruneExpiredPresence();
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Presence prune cron failed', stack);
    }
  }

  async pruneExpiredPresence(referenceMs = Date.now()): Promise<number> {
    const cutoffMs = this.getCutoffMs(referenceMs);

    try {
      const removed = await this.redis.zremrangebyscore(
        this.presenceRedisKey,
        '-inf',
        `(${cutoffMs}`,
      );
      return this.toInteger(removed, 'pruned presence count');
    } catch (error) {
      this.logRedisError('presence prune', error);
      throw error;
    }
  }

  private resolveMember(identity: PresenceIdentity): string {
    const authenticatedUserId = identity.authenticatedUserId?.trim();
    if (authenticatedUserId) {
      return `user:${authenticatedUserId}`;
    }

    const visitorId = identity.visitorId?.trim();
    if (!visitorId) {
      throw new BadRequestException('visitorId is required when no authenticated user is present');
    }

    return `visitor:${visitorId}`;
  }

  private getCutoffMs(referenceMs: number): number {
    return referenceMs - this.presenceTtlSeconds * 1000;
  }

  private readIntegerResult(
    results: Array<[Error | null, unknown]> | null,
    index: number,
    label: string,
  ): number {
    const entry = results?.[index];
    if (!entry) {
      throw new Error(`Redis pipeline did not return ${label}`);
    }

    const [error, value] = entry;
    if (error) {
      throw error;
    }

    return this.toInteger(value, label);
  }

  private toInteger(value: unknown, label: string): number {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : NaN;

    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`Redis returned an invalid ${label}`);
    }

    return parsed;
  }

  private parsePositiveIntEnv(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private logRedisError(action: string, error: unknown): void {
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(`Presence ${action} failed`, stack);
  }
}
