import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { Repository } from 'typeorm';
import { parseBooleanEnv } from '../common/utils/parse-boolean-env';
import { RedisService } from '../redis/redis.service';
import { PresenceHistoryRange } from './dto/presence-history-query.dto';
import {
  PresenceHistory,
  type PresenceHistoryBucketKind,
} from './entities/presence-history.entity';

interface PresenceIdentity {
  authenticatedUserId?: string | null;
  visitorId?: string;
}

export interface PresenceHistoryPoint {
  bucketStart: string;
  peakOnline: number;
  provisional: boolean;
}

export interface PresenceHistoryResponse {
  range: PresenceHistoryRange;
  granularity: 'hour' | 'day';
  timezone: 'UTC';
  points: PresenceHistoryPoint[];
}

interface CleanupStats {
  dayDeleted: number;
  hourDeleted: number;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly redis: Redis;
  private readonly presenceTtlSeconds: number;
  private readonly presenceRedisKey: string;
  private readonly hourPeakKeyPrefix: string;
  private readonly hourPeakTtlMs: number;
  private readonly jobsEnabled: boolean;
  private readonly pruneLockKey = 'lock:presence:history:hourly-finalizer';
  private readonly dailyRollupLockKey = 'lock:presence:history:daily-rollup';
  private readonly pruneLockTtlMs = 120_000;
  private readonly dailyRollupLockTtlMs = 300_000;
  private readonly recordHeartbeatScript = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', '(' .. ARGV[1])
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
    local online = tonumber(redis.call('ZCOUNT', KEYS[1], ARGV[1], '+inf'))
    local currentPeak = tonumber(redis.call('GET', KEYS[2]) or '-1')

    if online > currentPeak then
      redis.call('SET', KEYS[2], online, 'PX', ARGV[4])
    else
      redis.call('PEXPIRE', KEYS[2], ARGV[4])
    end

    return online
  `;
  private readonly releaseLockScript = `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    end
    return 0
  `;

  constructor(
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
    @InjectRepository(PresenceHistory)
    private readonly presenceHistoryRepo: Repository<PresenceHistory>,
  ) {
    this.redis = this.redisService.getClient();
    this.presenceTtlSeconds = this.parsePositiveIntEnv(
      this.config.get<string>('PRESENCE_TTL_SECONDS'),
      90,
    );
    this.presenceRedisKey =
      this.config.get<string>('PRESENCE_REDIS_KEY')?.trim() || 'presence:online';
    this.hourPeakKeyPrefix =
      this.config.get<string>('PRESENCE_HOUR_PEAK_REDIS_PREFIX')?.trim() || 'presence:peak:hour:';
    this.hourPeakTtlMs =
      this.parsePositiveIntEnv(this.config.get<string>('PRESENCE_HOUR_PEAK_TTL_HOURS'), 96) *
      60 *
      60 *
      1000;
    this.jobsEnabled = parseBooleanEnv(this.config.get<string>('SCHEDULED_JOBS_ENABLED'), true);
  }

  async recordHeartbeat(identity: PresenceIdentity): Promise<number> {
    const member = this.resolveMember(identity);
    const now = new Date();
    const nowMs = now.getTime();
    const cutoffMs = this.getCutoffMs(nowMs);
    const hourStart = this.startOfUtcHour(now);
    const hourPeakKey = this.buildHourPeakKey(hourStart);

    try {
      const result = await this.redis.eval(
        this.recordHeartbeatScript,
        2,
        this.presenceRedisKey,
        hourPeakKey,
        String(cutoffMs),
        String(nowMs),
        member,
        String(this.hourPeakTtlMs),
      );
      return this.toInteger(result, 'heartbeat count');
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

  async getPresenceHistory(range: PresenceHistoryRange): Promise<PresenceHistoryResponse> {
    if (range === PresenceHistoryRange.RANGE_72H) {
      return {
        range,
        granularity: 'hour',
        timezone: 'UTC',
        points: await this.getHourlyPresenceHistory(),
      };
    }

    const days = range === PresenceHistoryRange.RANGE_30D ? 30 : 365;
    return {
      range,
      granularity: 'day',
      timezone: 'UTC',
      points: await this.getDailyPresenceHistory(days),
    };
  }

  @Cron('*/10 * * * *')
  async handlePresencePruneCron(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }

    try {
      await this.pruneExpiredPresence();
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Presence prune cron failed', stack);
    }
  }

  @Cron('1 * * * *', { timeZone: 'UTC' })
  async handleHourlyHistoryFinalizerCron(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }

    try {
      await this.finalizeHourlyHistory();
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Presence hourly finalizer cron failed', stack);
    }
  }

  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async handleDailyHistoryRollupCron(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }

    try {
      await this.rollupDailyHistory();
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Presence daily rollup cron failed', stack);
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

  async finalizeHourlyHistory(referenceDate = new Date()): Promise<void> {
    const startedAt = Date.now();
    const lockValue = await this.acquireLock(this.pruneLockKey, this.pruneLockTtlMs);
    if (!lockValue) {
      this.logger.log(
        `hourly finalizer skipped reason=lock_not_acquired durationMs=${Date.now() - startedAt}`,
      );
      return;
    }

    try {
      const currentHourStart = this.startOfUtcHour(referenceDate);
      const earliestHour = this.addHours(currentHourStart, -72);
      const lastClosedHour = this.addHours(currentHourStart, -1);
      let processed = 0;

      for (
        let cursor = earliestHour;
        cursor.getTime() <= lastClosedHour.getTime();
        cursor = this.addHours(cursor, 1)
      ) {
        const peakKey = this.buildHourPeakKey(cursor);
        const rawPeak = await this.redis.get(peakKey);
        const peakOnline = rawPeak === null ? 0 : this.toInteger(rawPeak, 'hourly peak');

        await this.upsertHistoryBucket('hour', cursor, peakOnline);
        if (rawPeak !== null) {
          await this.redis.del(peakKey);
        }

        processed += 1;
      }

      this.logger.log(
        `hourly finalizer completed durationMs=${Date.now() - startedAt} processed=${processed}`,
      );
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`hourly finalizer failed durationMs=${Date.now() - startedAt}`, stack);
      throw error;
    } finally {
      await this.releaseLock(this.pruneLockKey, lockValue);
    }
  }

  async rollupDailyHistory(referenceDate = new Date()): Promise<void> {
    const startedAt = Date.now();
    const lockValue = await this.acquireLock(this.dailyRollupLockKey, this.dailyRollupLockTtlMs);
    if (!lockValue) {
      this.logger.log(
        `daily rollup skipped reason=lock_not_acquired durationMs=${Date.now() - startedAt}`,
      );
      return;
    }

    try {
      const currentDayStart = this.startOfUtcDay(referenceDate);
      const previousDayStart = this.addDays(currentDayStart, -1);
      const peakOnline = await this.findDailyPeak(previousDayStart, currentDayStart);

      await this.upsertHistoryBucket('day', previousDayStart, peakOnline);
      const cleanup = await this.cleanupHistory(referenceDate);

      this.logger.log(
        `daily rollup completed durationMs=${Date.now() - startedAt} day=${previousDayStart.toISOString()} peakOnline=${peakOnline} hourDeleted=${cleanup.hourDeleted} dayDeleted=${cleanup.dayDeleted}`,
      );
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`daily rollup failed durationMs=${Date.now() - startedAt}`, stack);
      throw error;
    } finally {
      await this.releaseLock(this.dailyRollupLockKey, lockValue);
    }
  }

  private async cleanupHistory(referenceDate = new Date()): Promise<CleanupStats> {
    const currentHourStart = this.startOfUtcHour(referenceDate);
    const currentDayStart = this.startOfUtcDay(referenceDate);
    const hourRetentionBoundary = this.addHours(currentHourStart, -72);
    const dayRetentionBoundary = this.addYears(currentDayStart, -3);

    const hourDelete = await this.presenceHistoryRepo
      .createQueryBuilder()
      .delete()
      .from(PresenceHistory)
      .where('bucket_kind = :bucketKind', { bucketKind: 'hour' })
      .andWhere('bucket_start < :boundary', {
        boundary: hourRetentionBoundary.toISOString(),
      })
      .execute();
    const dayDelete = await this.presenceHistoryRepo
      .createQueryBuilder()
      .delete()
      .from(PresenceHistory)
      .where('bucket_kind = :bucketKind', { bucketKind: 'day' })
      .andWhere('bucket_start < :boundary', {
        boundary: dayRetentionBoundary.toISOString(),
      })
      .execute();

    return {
      hourDeleted: hourDelete.affected ?? 0,
      dayDeleted: dayDelete.affected ?? 0,
    };
  }

  private async getHourlyPresenceHistory(
    referenceDate = new Date(),
  ): Promise<PresenceHistoryPoint[]> {
    const currentHourStart = this.startOfUtcHour(referenceDate);
    const firstBucket = this.addHours(currentHourStart, -71);
    const lastClosedHour = this.addHours(currentHourStart, -1);
    const rows = await this.readHistoryRows('hour', firstBucket, this.addHours(lastClosedHour, 1));
    const rowsByBucket = new Map(rows.map((row) => [row.bucketStart, row.peakOnline]));
    const provisionalPeak = await this.getCurrentHourPeak(referenceDate);

    const points: PresenceHistoryPoint[] = [];
    for (
      let cursor = firstBucket;
      cursor.getTime() <= currentHourStart.getTime();
      cursor = this.addHours(cursor, 1)
    ) {
      const bucketStart = cursor.toISOString();
      const provisional = cursor.getTime() === currentHourStart.getTime();
      points.push({
        bucketStart,
        peakOnline: provisional ? provisionalPeak : (rowsByBucket.get(bucketStart) ?? 0),
        provisional,
      });
    }

    return points;
  }

  private async getDailyPresenceHistory(
    dayCount: number,
    referenceDate = new Date(),
  ): Promise<PresenceHistoryPoint[]> {
    const currentDayStart = this.startOfUtcDay(referenceDate);
    const firstBucket = this.addDays(currentDayStart, -dayCount);
    const lastBucket = this.addDays(currentDayStart, -1);
    const rows = await this.readHistoryRows('day', firstBucket, currentDayStart);
    const rowsByBucket = new Map(rows.map((row) => [row.bucketStart, row.peakOnline]));

    const points: PresenceHistoryPoint[] = [];
    for (
      let cursor = firstBucket;
      cursor.getTime() <= lastBucket.getTime();
      cursor = this.addDays(cursor, 1)
    ) {
      const bucketStart = cursor.toISOString();
      points.push({
        bucketStart,
        peakOnline: rowsByBucket.get(bucketStart) ?? 0,
        provisional: false,
      });
    }

    return points;
  }

  private async readHistoryRows(
    bucketKind: PresenceHistoryBucketKind,
    fromInclusive: Date,
    toExclusive: Date,
  ): Promise<Array<{ bucketStart: string; peakOnline: number }>> {
    const rows: Array<{ bucket_start: string | Date; peak_online: string | number }> =
      await this.presenceHistoryRepo.query(
        `
          SELECT bucket_start, peak_online
          FROM presence_history
          WHERE bucket_kind = $1
            AND bucket_start >= $2
            AND bucket_start < $3
          ORDER BY bucket_start ASC
        `,
        [bucketKind, fromInclusive.toISOString(), toExclusive.toISOString()],
      );

    return rows.map((row) => ({
      bucketStart: new Date(row.bucket_start).toISOString(),
      peakOnline: Number(row.peak_online),
    }));
  }

  private async findDailyPeak(previousDayStart: Date, currentDayStart: Date): Promise<number> {
    const rows: Array<{ peak_online: string | number }> = await this.presenceHistoryRepo.query(
      `
        SELECT COALESCE(MAX(peak_online), 0) AS peak_online
        FROM presence_history
        WHERE bucket_kind = 'hour'
          AND bucket_start >= $1
          AND bucket_start < $2
      `,
      [previousDayStart.toISOString(), currentDayStart.toISOString()],
    );

    return Number(rows[0]?.peak_online ?? 0);
  }

  private async getCurrentHourPeak(referenceDate = new Date()): Promise<number> {
    const peakKey = this.buildHourPeakKey(this.startOfUtcHour(referenceDate));
    const peak = await this.redis.get(peakKey);
    return peak === null ? 0 : this.toInteger(peak, 'current hour peak');
  }

  private async upsertHistoryBucket(
    bucketKind: PresenceHistoryBucketKind,
    bucketStart: Date,
    peakOnline: number,
  ): Promise<void> {
    await this.presenceHistoryRepo.query(
      `
        INSERT INTO presence_history (
          bucket_kind,
          bucket_start,
          peak_online
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (bucket_kind, bucket_start) DO UPDATE SET
          peak_online = GREATEST(
            presence_history.peak_online,
            EXCLUDED.peak_online
          ),
          updated_at = now()
      `,
      [bucketKind, bucketStart.toISOString(), peakOnline],
    );
  }

  private async acquireLock(lockKey: string, ttlMs: number): Promise<string | null> {
    const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const acquired = await this.redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
    return acquired === 'OK' ? lockValue : null;
  }

  private async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    try {
      await this.redis.eval(this.releaseLockScript, 1, lockKey, lockValue);
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.warn(`Could not release lock ${lockKey}`, stack);
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

  private buildHourPeakKey(hourStart: Date): string {
    return `${this.hourPeakKeyPrefix}${hourStart.toISOString()}`;
  }

  private startOfUtcHour(referenceDate: Date): Date {
    const date = new Date(referenceDate);
    date.setUTCMinutes(0, 0, 0);
    return date;
  }

  private startOfUtcDay(referenceDate: Date): Date {
    const date = new Date(referenceDate);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private addHours(referenceDate: Date, hours: number): Date {
    const date = new Date(referenceDate);
    date.setUTCHours(date.getUTCHours() + hours);
    return date;
  }

  private addDays(referenceDate: Date, days: number): Date {
    const date = new Date(referenceDate);
    date.setUTCDate(date.getUTCDate() + days);
    return date;
  }

  private addYears(referenceDate: Date, years: number): Date {
    const date = new Date(referenceDate);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return date;
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
