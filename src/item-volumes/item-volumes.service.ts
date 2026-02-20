import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemVolumeBucket } from './entities/item-volume-bucket.entity';

interface WikiHourVolumeEntry {
  highPriceVolume?: number;
  lowPriceVolume?: number;
}

interface WikiHourResponse {
  data?: Record<string, WikiHourVolumeEntry>;
}

interface HourVolume {
  highVolume: number;
  lowVolume: number;
}

interface ItemVol24h {
  high24h: number;
  low24h: number;
  total24h: number;
  updatedAt: number;
}

@Injectable()
export class ItemVolumesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ItemVolumesService.name);
  private readonly redis: Redis;
  private readonly volumesApi = 'https://prices.runescape.wiki/api/v1/osrs/1h';
  private readonly vol24hHashKey = 'items:vol24h';
  private readonly lockKey = 'lock:items:volumes:1h';
  private readonly lockTtlSeconds = 180;
  private readonly initEnabled: boolean;
  private readonly userAgent =
    'osrstool-backend/1.0 (+https://github.com/CarmineBD/osrstool-backend)';
  private readonly releaseLockScript =
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  private readonly finalizeSwapScript =
    "if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end redis.call('RENAME', KEYS[1], KEYS[2]) redis.call('HDEL', KEYS[2], ARGV[1]) return 1";

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectRepository(ItemVolumeBucket)
    private readonly volumeBucketRepo: Repository<ItemVolumeBucket>,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL') as string;
    this.redis = new Redis(redisUrl);

    const initFlag = (this.config.get<string>('ITEM_VOLUMES_INIT_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();
    this.initEnabled = initFlag !== 'false' && initFlag !== '0';
  }

  async onModuleInit(): Promise<void> {
    if (!this.initEnabled) {
      this.logger.log('Skipping item volume init pipeline (ITEM_VOLUMES_INIT_ENABLED=false).');
      return;
    }
    await this.runVolumePipeline('init', this.getCurrentHourTs());
  }

  onModuleDestroy(): void {
    void this.redis.quit();
  }

  @Cron('15 0 * * * *')
  async handleHourlyJob(): Promise<void> {
    await this.runVolumePipeline('cron', this.getCurrentHourTs());
  }

  async forceBackfillLast24Hours(referenceTs?: number): Promise<void> {
    const hourTs =
      referenceTs === undefined ? this.getCurrentHourTs() : this.normalizeHourTs(referenceTs);
    await this.runVolumePipeline('manual', hourTs);
  }

  async fetchVolumesHour(timestamp?: number): Promise<Record<string, HourVolume>> {
    if (timestamp !== undefined && Math.floor(timestamp) % 3600 !== 0) {
      this.logger.warn(`Timestamp ${timestamp} is not hour-aligned. It will be truncated.`);
    }
    const hourTs = timestamp === undefined ? undefined : this.normalizeHourTs(timestamp);

    try {
      const { data } = await firstValueFrom(
        this.http.get<WikiHourResponse>(this.volumesApi, {
          headers: { 'User-Agent': this.userAgent },
          params: hourTs === undefined ? undefined : { timestamp: hourTs },
        }),
      );

      const payload = data?.data;
      if (!payload || typeof payload !== 'object') {
        this.logger.warn(`Unexpected /1h payload for timestamp=${hourTs ?? 'latest'}.`);
        return {};
      }

      const result: Record<string, HourVolume> = {};
      for (const [itemId, entry] of Object.entries(payload)) {
        const parsedId = Number.parseInt(itemId, 10);
        if (!Number.isInteger(parsedId) || parsedId <= 0 || !entry) {
          continue;
        }

        const highVolume = this.toNonNegativeInt(entry.highPriceVolume);
        const lowVolume = this.toNonNegativeInt(entry.lowPriceVolume);
        result[String(parsedId)] = { highVolume, lowVolume };
      }

      return result;
    } catch (error) {
      this.logger.error(`Error fetching /1h volumes for timestamp=${hourTs ?? 'latest'}`, error);
      return {};
    }
  }

  async persistBucket(hourTs: number, data: Record<string, HourVolume>): Promise<number> {
    const normalizedHourTs = this.normalizeHourTs(hourTs);
    const bucketDate = new Date(normalizedHourTs * 1000);
    const entities: Array<Partial<ItemVolumeBucket>> = [];

    for (const [itemIdRaw, volumes] of Object.entries(data)) {
      const itemId = Number.parseInt(itemIdRaw, 10);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        continue;
      }

      entities.push({
        itemId,
        bucketTs: bucketDate,
        highVolume: this.toNonNegativeInt(volumes.highVolume),
        lowVolume: this.toNonNegativeInt(volumes.lowVolume),
      });
    }

    if (entities.length === 0) {
      this.logger.warn(`No item volumes to persist for hour ${normalizedHourTs}.`);
      return 0;
    }

    const chunkSize = 1000;
    for (let i = 0; i < entities.length; i += chunkSize) {
      const chunk = entities.slice(i, i + chunkSize);
      await this.volumeBucketRepo.upsert(chunk, ['itemId', 'bucketTs']);
    }

    return entities.length;
  }

  async cleanupOldBuckets(referenceHourTs: number): Promise<number> {
    const cutoffTs = this.normalizeHourTs(referenceHourTs) - 24 * 3600;
    const cutoffDate = new Date(cutoffTs * 1000);
    const result = await this.volumeBucketRepo
      .createQueryBuilder()
      .delete()
      .from(ItemVolumeBucket)
      .where('bucket_ts <= :cutoff', { cutoff: cutoffDate.toISOString() })
      .execute();

    return result.affected ?? 0;
  }

  async computeVol24h(referenceHourTs: number): Promise<Record<string, ItemVol24h>> {
    const hourTs = this.normalizeHourTs(referenceHourTs);
    const cutoffTs = hourTs - 24 * 3600;
    const nowUnix = Math.floor(Date.now() / 1000);

    const rows = await this.volumeBucketRepo
      .createQueryBuilder('bucket')
      .select('bucket.item_id', 'itemId')
      .addSelect('COALESCE(SUM(bucket.high_volume), 0)::bigint', 'high24h')
      .addSelect('COALESCE(SUM(bucket.low_volume), 0)::bigint', 'low24h')
      .where('bucket.bucket_ts > :cutoff', { cutoff: new Date(cutoffTs * 1000).toISOString() })
      .andWhere('bucket.bucket_ts <= :hourTs', { hourTs: new Date(hourTs * 1000).toISOString() })
      .groupBy('bucket.item_id')
      .getRawMany<{ itemId: string; high24h: string; low24h: string }>();

    const result: Record<string, ItemVol24h> = {};
    for (const row of rows) {
      const itemId = Number.parseInt(row.itemId, 10);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        continue;
      }

      const high24h = this.toNonNegativeInt(Number.parseInt(row.high24h, 10));
      const low24h = this.toNonNegativeInt(Number.parseInt(row.low24h, 10));
      result[String(itemId)] = {
        high24h,
        low24h,
        total24h: high24h + low24h,
        updatedAt: nowUnix,
      };
    }

    return result;
  }

  async writeRedisVol24hAtomically(volumes: Record<string, ItemVol24h>): Promise<void> {
    const tmpKey = `${this.vol24hHashKey}:tmp:${Date.now()}:${Math.floor(Math.random() * 100000)}`;
    const sentinelField = '__tmp__';

    try {
      await this.redis.call('HSET', tmpKey, sentinelField, '1');

      const entries = Object.entries(volumes);
      const chunkSize = 500;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        const pipeline = this.redis.pipeline();
        for (const [itemId, value] of chunk) {
          pipeline.hset(tmpKey, itemId, JSON.stringify(value));
        }
        await pipeline.exec();
      }

      await this.redis.call(
        'EVAL',
        this.finalizeSwapScript,
        2,
        tmpKey,
        this.vol24hHashKey,
        sentinelField,
      );
    } catch (error) {
      this.logger.error('Error writing items:vol24h atomically', error);
      throw error;
    } finally {
      try {
        await this.redis.call('DEL', tmpKey);
      } catch {
        // Best effort cleanup for temporary keys.
      }
    }
  }

  async getMany(ids: number[]): Promise<Record<number, ItemVol24h>> {
    if (ids.length === 0) return {};

    const fields = ids.map(String);
    const raw: unknown = await this.redis.call('HMGET', this.vol24hHashKey, ...fields);
    const rows: unknown[] = Array.isArray(raw) ? raw : [];

    const result: Record<number, ItemVol24h> = {};
    for (let i = 0; i < ids.length; i += 1) {
      const fieldValue = rows[i];
      if (typeof fieldValue !== 'string') {
        continue;
      }

      try {
        const parsed: unknown = JSON.parse(fieldValue);
        if (!this.isItemVol24h(parsed)) {
          continue;
        }
        result[ids[i]] = parsed;
      } catch {
        continue;
      }
    }

    return result;
  }

  async getAll(): Promise<Record<number, ItemVol24h>> {
    const raw: unknown = await this.redis.call('HGETALL', this.vol24hHashKey);
    const result: Record<number, ItemVol24h> = {};

    if (Array.isArray(raw)) {
      const entries: unknown[] = raw;
      for (let i = 0; i < entries.length; i += 2) {
        const field = entries[i];
        const value = entries[i + 1];
        if (typeof field !== 'string' || typeof value !== 'string') {
          continue;
        }
        this.trySetParsedHashValue(result, field, value);
      }
      return result;
    }

    if (!raw || typeof raw !== 'object') {
      return result;
    }

    for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== 'string') {
        continue;
      }
      this.trySetParsedHashValue(result, field, value);
    }

    return result;
  }

  private async runVolumePipeline(
    trigger: 'init' | 'cron' | 'manual',
    referenceHourTs: number,
  ): Promise<void> {
    const lockValue = await this.acquireLock();
    if (!lockValue) {
      this.logger.log(`Skipping ${trigger} run for items:vol24h (lock already acquired).`);
      return;
    }

    const normalizedHourTs = this.normalizeHourTs(referenceHourTs);
    const startedAt = Date.now();

    try {
      const backfilledHours = await this.backfillIfNeeded(normalizedHourTs);
      const deletedRows = await this.cleanupOldBuckets(normalizedHourTs);
      const vol24h = await this.computeVol24h(normalizedHourTs);
      await this.writeRedisVol24hAtomically(vol24h);

      this.logger.log(
        `items:vol24h refresh done (trigger=${trigger}, hourTs=${normalizedHourTs}, backfilled=${backfilledHours}, rows=${Object.keys(vol24h).length}, deleted=${deletedRows}, tookMs=${Date.now() - startedAt})`,
      );
    } catch (error) {
      this.logger.error(`items:vol24h refresh failed (trigger=${trigger})`, error);
    } finally {
      await this.releaseLock(lockValue);
    }
  }

  private async backfillIfNeeded(referenceHourTs: number): Promise<number> {
    const normalizedHourTs = this.normalizeHourTs(referenceHourTs);
    const expectedHours = this.getExpectedHours(normalizedHourTs);
    const existingHours = await this.getExistingHoursSet(expectedHours[0], normalizedHourTs);
    const missingHours = expectedHours.filter((hourTs) => !existingHours.has(hourTs));

    if (missingHours.length === 0) {
      return 0;
    }

    this.logger.log(
      `Missing ${missingHours.length} hourly item-volume buckets. Starting backfill.`,
    );

    let insertedHours = 0;
    for (const hourTs of missingHours) {
      const hourlyData = await this.fetchVolumesHour(hourTs);
      if (Object.keys(hourlyData).length === 0) {
        this.logger.warn(`Skipping empty /1h backfill payload for hour ${hourTs}.`);
        continue;
      }

      await this.persistBucket(hourTs, hourlyData);
      insertedHours += 1;
    }

    return insertedHours;
  }

  private async getExistingHoursSet(startHourTs: number, endHourTs: number): Promise<Set<number>> {
    const rows = await this.volumeBucketRepo
      .createQueryBuilder('bucket')
      .select('EXTRACT(EPOCH FROM bucket.bucket_ts)::bigint', 'hourTs')
      .where('bucket.bucket_ts >= :startTs', {
        startTs: new Date(startHourTs * 1000).toISOString(),
      })
      .andWhere('bucket.bucket_ts <= :endTs', { endTs: new Date(endHourTs * 1000).toISOString() })
      .groupBy('bucket.bucket_ts')
      .getRawMany<{ hourTs: string }>();

    return new Set(
      rows
        .map((row) => Number.parseInt(row.hourTs, 10))
        .filter((hourTs) => Number.isInteger(hourTs) && hourTs > 0),
    );
  }

  private getExpectedHours(referenceHourTs: number): number[] {
    const normalizedHourTs = this.normalizeHourTs(referenceHourTs);
    const startHourTs = normalizedHourTs - (24 - 1) * 3600;

    const expected: number[] = [];
    for (let hourTs = startHourTs; hourTs <= normalizedHourTs; hourTs += 3600) {
      expected.push(hourTs);
    }

    return expected;
  }

  private getCurrentHourTs(): number {
    return this.normalizeHourTs(Math.floor(Date.now() / 1000));
  }

  private normalizeHourTs(timestamp: number): number {
    const parsed = Number.isFinite(timestamp) ? Math.floor(timestamp) : 0;
    if (parsed <= 0) {
      throw new Error(`Invalid timestamp: ${timestamp}`);
    }

    const normalized = Math.floor(parsed / 3600) * 3600;
    return normalized;
  }

  private toNonNegativeInt(value: unknown): number {
    let parsed: number;
    if (typeof value === 'number') {
      parsed = value;
    } else if (typeof value === 'string') {
      parsed = Number.parseFloat(value);
    } else {
      return 0;
    }

    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  private isItemVol24h(value: unknown): value is ItemVol24h {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.high24h === 'number' &&
      typeof candidate.low24h === 'number' &&
      typeof candidate.total24h === 'number' &&
      typeof candidate.updatedAt === 'number'
    );
  }

  private trySetParsedHashValue(
    result: Record<number, ItemVol24h>,
    field: string,
    value: string,
  ): void {
    const itemId = Number.parseInt(field, 10);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(value);
      if (!this.isItemVol24h(parsed)) {
        return;
      }
      result[itemId] = parsed;
    } catch {
      return;
    }
  }

  private async acquireLock(): Promise<string | null> {
    const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const acquired = await this.redis.set(this.lockKey, lockValue, 'EX', this.lockTtlSeconds, 'NX');
    return acquired === 'OK' ? lockValue : null;
  }

  private async releaseLock(lockValue: string): Promise<void> {
    try {
      await this.redis.call('EVAL', this.releaseLockScript, 1, this.lockKey, lockValue);
    } catch (error) {
      this.logger.warn('Could not release items volume lock', error);
    }
  }
}
