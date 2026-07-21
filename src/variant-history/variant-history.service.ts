import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { VariantHistory15m } from '../methods/entities/variant-history-15m.entity';
import { VariantHistoryDaily } from '../methods/entities/variant-history-daily.entity';
import { VariantHistory } from '../methods/entities/variant-history.entity';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { parseBooleanEnv } from '../common/utils/parse-boolean-env';
import {
  HistoryAgg,
  HistoryGranularity,
  HistoryRange,
  VariantHistoryQueryDto,
} from './dto/variant-history-query.dto';

interface RollupWriteStats {
  inserted: number;
  updated: number;
}

@Injectable()
export class VariantHistoryService {
  private readonly logger = new Logger(VariantHistoryService.name);
  private readonly redis: Redis;
  private readonly methodsProfitsHashKey = 'methods:profits';
  private readonly jobsEnabled: boolean;
  private readonly pruneEnabled: boolean;
  private readonly rawRetentionHours: number;
  private readonly history15mRetentionDays: number;
  private readonly captureLockKey = 'lock:variant-history:capture';
  private readonly pruneLockKey = 'lock:variant-history:prune';
  private readonly captureLockTtlSeconds = 240;
  private readonly pruneLockTtlSeconds = 1800;
  private readonly releaseLockScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    end
    return 0
  `;

  constructor(
    @InjectRepository(VariantHistory)
    private readonly historyRepo: Repository<VariantHistory>,
    @InjectRepository(VariantHistory15m)
    private readonly history15mRepo: Repository<VariantHistory15m>,
    @InjectRepository(VariantHistoryDaily)
    private readonly dailyHistoryRepo: Repository<VariantHistoryDaily>,
    @InjectRepository(VariantSnapshot)
    private readonly snapshotRepo: Repository<VariantSnapshot>,
    private readonly config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL') as string;
    this.redis = new Redis(redisUrl);
    this.jobsEnabled = parseBooleanEnv(this.config.get<string>('SCHEDULED_JOBS_ENABLED'), true);
    this.pruneEnabled = parseBooleanEnv(
      this.config.get<string>('VARIANT_HISTORY_PRUNE_ENABLED'),
      false,
    );
    this.rawRetentionHours = this.parsePositiveIntEnv(
      this.config.get<string>('VARIANT_HISTORY_RAW_RETENTION_HOURS'),
      72,
    );
    this.history15mRetentionDays = this.parsePositiveIntEnv(
      this.config.get<string>('VARIANT_HISTORY_15M_RETENTION_DAYS'),
      90,
    );
  }

  private parsePositiveIntEnv(value: string | undefined, fallback: number): number {
    if (!value) return fallback;

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async acquireLock(lockKey: string, ttlSeconds: number): Promise<string | null> {
    const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const acquired = await this.redis.call('SET', lockKey, lockValue, 'EX', ttlSeconds, 'NX');
    return acquired === 'OK' ? lockValue : null;
  }

  private async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    try {
      await this.redis.call('EVAL', this.releaseLockScript, 1, lockKey, lockValue);
    } catch (error) {
      this.logger.warn(`Could not release lock ${lockKey}`, error);
    }
  }

  private parseProfitRecord(value: unknown): Record<string, { low: number; high: number }> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const result: Record<string, { low: number; high: number }> = {};
    for (const [variantId, candidate] of Object.entries(value as Record<string, unknown>)) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        continue;
      }

      const maybeProfit = candidate as Record<string, unknown>;
      if (typeof maybeProfit.low !== 'number' || typeof maybeProfit.high !== 'number') {
        continue;
      }

      result[variantId] = {
        low: maybeProfit.low,
        high: maybeProfit.high,
      };
    }

    return result;
  }

  private parseProfitRecordString(value: unknown): Record<string, { low: number; high: number }> {
    const rawText =
      typeof value === 'string' ? value : Buffer.isBuffer(value) ? value.toString('utf8') : null;
    if (!rawText) return {};

    try {
      return this.parseProfitRecord(JSON.parse(rawText)) ?? {};
    } catch {
      return {};
    }
  }

  private parseHashProfits(
    raw: unknown,
  ): Record<string, Record<string, { low: number; high: number }>> {
    const result: Record<string, Record<string, { low: number; high: number }>> = {};

    if (Array.isArray(raw)) {
      const entries = raw as unknown[];
      for (let i = 0; i < entries.length; i += 2) {
        const field = entries[i];
        const value = entries[i + 1];
        if (typeof field !== 'string') continue;
        result[field] = this.parseProfitRecordString(value);
      }
      return result;
    }

    if (!raw || typeof raw !== 'object') {
      return result;
    }

    for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
      result[field] = this.parseProfitRecordString(value);
    }

    return result;
  }

  private async getAllMethodsProfits(): Promise<
    Record<string, Record<string, { low: number; high: number }>>
  > {
    const hashRaw = await this.redis.call('HGETALL', this.methodsProfitsHashKey);
    return this.parseHashProfits(hashRaw);
  }

  private countUpsertResults(
    rows: Array<{ inserted_count: number | string; updated_count: number | string }>,
  ): RollupWriteStats {
    return rows.reduce(
      (acc, row) => ({
        inserted: acc.inserted + Number(row.inserted_count),
        updated: acc.updated + Number(row.updated_count),
      }),
      { inserted: 0, updated: 0 },
    );
  }

  @Cron('*/5 * * * *')
  async handleCaptureCron(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }

    await this.capture();
  }

  async capture(): Promise<void> {
    const startedAt = Date.now();
    const lockValue = await this.acquireLock(this.captureLockKey, this.captureLockTtlSeconds);
    if (!lockValue) {
      this.logger.log(
        `capture skipped reason=lock_not_acquired durationMs=${Date.now() - startedAt}`,
      );
      return;
    }

    try {
      const profits = await this.getAllMethodsProfits();
      if (Object.keys(profits).length === 0) {
        this.logger.warn(`capture skipped reason=no_profits durationMs=${Date.now() - startedAt}`);
        return;
      }

      const now = new Date();
      const records: VariantHistory[] = [];
      for (const variants of Object.values(profits)) {
        for (const [variantId, profit] of Object.entries(variants)) {
          records.push(
            this.historyRepo.create({
              variant: { id: variantId } as MethodVariant,
              timestamp: now,
              lowProfit: profit.low,
              highProfit: profit.high,
            }),
          );
        }
      }

      if (records.length === 0) {
        this.logger.log(`capture skipped reason=no_records durationMs=${Date.now() - startedAt}`);
        return;
      }

      const rawStartedAt = Date.now();
      await this.historyRepo.save(records);
      const rawDurationMs = Date.now() - rawStartedAt;

      const history15mStartedAt = Date.now();
      const history15mStats = await this.upsert15mHistory(records);
      const history15mDurationMs = Date.now() - history15mStartedAt;

      const dailyStartedAt = Date.now();
      const dailyStats = await this.upsertDailyHistory(records);
      const dailyDurationMs = Date.now() - dailyStartedAt;

      this.logger.log(
        `capture completed durationMs=${Date.now() - startedAt} rawInserted=${records.length} rawUpdated=0 rawSaveMs=${rawDurationMs} intraday15mInserted=${history15mStats.inserted} intraday15mUpdated=${history15mStats.updated} intraday15mMs=${history15mDurationMs} dailyInserted=${dailyStats.inserted} dailyUpdated=${dailyStats.updated} dailyMs=${dailyDurationMs}`,
      );
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`capture failed durationMs=${Date.now() - startedAt}`, stack);
      throw error;
    } finally {
      await this.releaseLock(this.captureLockKey, lockValue);
    }
  }

  private async upsert15mHistory(records: VariantHistory[]): Promise<RollupWriteStats> {
    if (records.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const params: unknown[] = [];
    const valuesSql = records.map((record, index) => {
      const base = index * 4;
      params.push(record.variant.id, record.timestamp, record.lowProfit, record.highProfit);
      return `($${base + 1}::uuid, $${base + 2}::timestamptz, $${base + 3}::numeric, $${base + 4}::numeric)`;
    });

    const rows: Array<{ inserted_count: number | string; updated_count: number | string }> =
      await this.history15mRepo.query(
        `
        INSERT INTO variant_history_15m (
          variant_id,
          bucket_start,
          low_profit_sum,
          high_profit_sum,
          low_profit_min,
          low_profit_max,
          high_profit_min,
          high_profit_max,
          open_low_profit,
          open_high_profit,
          open_timestamp,
          close_low_profit,
          close_high_profit,
          close_timestamp,
          samples,
          updated_at
        )
        SELECT
          input.variant_id,
          to_timestamp(floor(extract(epoch FROM input.timestamp) / 900) * 900),
          input.low_profit,
          input.high_profit,
          input.low_profit,
          input.low_profit,
          input.high_profit,
          input.high_profit,
          input.low_profit,
          input.high_profit,
          input.timestamp,
          input.low_profit,
          input.high_profit,
          input.timestamp,
          1,
          now()
        FROM (VALUES ${valuesSql.join(', ')}) AS input(
          variant_id,
          timestamp,
          low_profit,
          high_profit
        )
        ON CONFLICT (variant_id, bucket_start) DO UPDATE SET
          low_profit_sum = variant_history_15m.low_profit_sum + EXCLUDED.low_profit_sum,
          high_profit_sum = variant_history_15m.high_profit_sum + EXCLUDED.high_profit_sum,
          low_profit_min = LEAST(variant_history_15m.low_profit_min, EXCLUDED.low_profit_min),
          low_profit_max = GREATEST(variant_history_15m.low_profit_max, EXCLUDED.low_profit_max),
          high_profit_min = LEAST(variant_history_15m.high_profit_min, EXCLUDED.high_profit_min),
          high_profit_max = GREATEST(variant_history_15m.high_profit_max, EXCLUDED.high_profit_max),
          open_low_profit = CASE
            WHEN EXCLUDED.open_timestamp < variant_history_15m.open_timestamp
              THEN EXCLUDED.open_low_profit
            ELSE variant_history_15m.open_low_profit
          END,
          open_high_profit = CASE
            WHEN EXCLUDED.open_timestamp < variant_history_15m.open_timestamp
              THEN EXCLUDED.open_high_profit
            ELSE variant_history_15m.open_high_profit
          END,
          open_timestamp = LEAST(variant_history_15m.open_timestamp, EXCLUDED.open_timestamp),
          close_low_profit = CASE
            WHEN EXCLUDED.close_timestamp > variant_history_15m.close_timestamp
              THEN EXCLUDED.close_low_profit
            ELSE variant_history_15m.close_low_profit
          END,
          close_high_profit = CASE
            WHEN EXCLUDED.close_timestamp > variant_history_15m.close_timestamp
              THEN EXCLUDED.close_high_profit
            ELSE variant_history_15m.close_high_profit
          END,
          close_timestamp = GREATEST(variant_history_15m.close_timestamp, EXCLUDED.close_timestamp),
          samples = variant_history_15m.samples + EXCLUDED.samples,
          updated_at = now()
        RETURNING
          CASE WHEN xmax = 0 THEN 1 ELSE 0 END AS inserted_count,
          CASE WHEN xmax = 0 THEN 0 ELSE 1 END AS updated_count
      `,
        params,
      );

    return this.countUpsertResults(rows);
  }

  private async upsertDailyHistory(records: VariantHistory[]): Promise<RollupWriteStats> {
    if (records.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const params: unknown[] = [];
    const valuesSql = records.map((record, index) => {
      const base = index * 4;
      params.push(record.variant.id, record.timestamp, record.lowProfit, record.highProfit);
      return `($${base + 1}::uuid, $${base + 2}::timestamptz, $${base + 3}::numeric, $${base + 4}::numeric)`;
    });

    const rows: Array<{ inserted_count: number | string; updated_count: number | string }> =
      await this.dailyHistoryRepo.query(
        `
        INSERT INTO variant_history_daily (
          variant_id,
          bucket_date,
          low_profit_sum,
          high_profit_sum,
          low_profit_min,
          low_profit_max,
          high_profit_min,
          high_profit_max,
          open_low_profit,
          open_high_profit,
          open_timestamp,
          close_low_profit,
          close_high_profit,
          close_timestamp,
          samples,
          updated_at
        )
        SELECT
          input.variant_id,
          (input.timestamp AT TIME ZONE 'Europe/London')::date AS bucket_date,
          input.low_profit,
          input.high_profit,
          input.low_profit,
          input.low_profit,
          input.high_profit,
          input.high_profit,
          input.low_profit,
          input.high_profit,
          input.timestamp,
          input.low_profit,
          input.high_profit,
          input.timestamp,
          1,
          now()
        FROM (VALUES ${valuesSql.join(', ')}) AS input(
          variant_id,
          timestamp,
          low_profit,
          high_profit
        )
        ON CONFLICT (variant_id, bucket_date) DO UPDATE SET
          low_profit_sum = variant_history_daily.low_profit_sum + EXCLUDED.low_profit_sum,
          high_profit_sum = variant_history_daily.high_profit_sum + EXCLUDED.high_profit_sum,
          low_profit_min = LEAST(variant_history_daily.low_profit_min, EXCLUDED.low_profit_min),
          low_profit_max = GREATEST(variant_history_daily.low_profit_max, EXCLUDED.low_profit_max),
          high_profit_min = LEAST(variant_history_daily.high_profit_min, EXCLUDED.high_profit_min),
          high_profit_max = GREATEST(variant_history_daily.high_profit_max, EXCLUDED.high_profit_max),
          open_low_profit = CASE
            WHEN EXCLUDED.open_timestamp < variant_history_daily.open_timestamp
              THEN EXCLUDED.open_low_profit
            ELSE variant_history_daily.open_low_profit
          END,
          open_high_profit = CASE
            WHEN EXCLUDED.open_timestamp < variant_history_daily.open_timestamp
              THEN EXCLUDED.open_high_profit
            ELSE variant_history_daily.open_high_profit
          END,
          open_timestamp = LEAST(variant_history_daily.open_timestamp, EXCLUDED.open_timestamp),
          close_low_profit = CASE
            WHEN EXCLUDED.close_timestamp > variant_history_daily.close_timestamp
              THEN EXCLUDED.close_low_profit
            ELSE variant_history_daily.close_low_profit
          END,
          close_high_profit = CASE
            WHEN EXCLUDED.close_timestamp > variant_history_daily.close_timestamp
              THEN EXCLUDED.close_high_profit
            ELSE variant_history_daily.close_high_profit
          END,
          close_timestamp = GREATEST(variant_history_daily.close_timestamp, EXCLUDED.close_timestamp),
          samples = variant_history_daily.samples + EXCLUDED.samples,
          updated_at = now()
        RETURNING
          CASE WHEN xmax = 0 THEN 1 ELSE 0 END AS inserted_count,
          CASE WHEN xmax = 0 THEN 0 ELSE 1 END AS updated_count
      `,
        params,
      );

    return this.countUpsertResults(rows);
  }

  private normalizeGranularity(
    range: HistoryRange,
    granularity: HistoryGranularity,
  ): HistoryGranularity {
    const isLongRange = range === HistoryRange.RANGE_1Y || range === HistoryRange.RANGE_ALL;
    const isFinerThanDay =
      granularity === HistoryGranularity.MIN_10 ||
      granularity === HistoryGranularity.MIN_30 ||
      granularity === HistoryGranularity.HOUR_2;

    if (isLongRange && isFinerThanDay) {
      return HistoryGranularity.DAY_1;
    }

    return granularity;
  }

  private shouldUseDailyHistory(range: HistoryRange, granularity: HistoryGranularity): boolean {
    const isLongRange = range === HistoryRange.RANGE_1Y || range === HistoryRange.RANGE_ALL;
    const isDailyOrLarger =
      granularity === HistoryGranularity.DAY_1 ||
      granularity === HistoryGranularity.WEEK_1 ||
      granularity === HistoryGranularity.MONTH_1;

    return isLongRange && isDailyOrLarger;
  }

  private shouldUse15mHistory(
    range: HistoryRange,
    granularity: HistoryGranularity,
    from: Date,
    to: Date,
  ): boolean {
    const supportsRange = range === HistoryRange.RANGE_1W || range === HistoryRange.RANGE_1M;
    const supportsGranularity =
      granularity === HistoryGranularity.MIN_30 || granularity === HistoryGranularity.HOUR_2;

    if (!supportsRange || !supportsGranularity) {
      return false;
    }

    const history15mRetentionBoundary = new Date(
      to.getTime() - this.history15mRetentionDays * 24 * 60 * 60 * 1000,
    );

    return from >= history15mRetentionBoundary;
  }

  private buildDailyBucketExpression(granularity: HistoryGranularity): string {
    if (granularity === HistoryGranularity.DAY_1) {
      return "date_trunc('day', bucket_date::timestamp) AT TIME ZONE 'UTC'";
    }

    const trunc = granularity === HistoryGranularity.WEEK_1 ? 'week' : 'month';
    return `date_trunc('${trunc}', bucket_date::timestamp) AT TIME ZONE 'UTC'`;
  }

  private build15mBucketExpression(granularity: HistoryGranularity): string {
    if (granularity === HistoryGranularity.MIN_30) {
      return 'to_timestamp(floor(extract(epoch FROM bucket_start) / 1800) * 1800)';
    }

    return 'to_timestamp(floor(extract(epoch FROM bucket_start) / 7200) * 7200)';
  }

  private buildRawSelectClause(agg: HistoryAgg, bucketExpr: string): string {
    if (agg === HistoryAgg.AVG) {
      return `
        ${bucketExpr} AS bucket,
        AVG(low_profit)::float AS low_profit,
        AVG(high_profit)::float AS high_profit
      `;
    }

    if (agg === HistoryAgg.CLOSE) {
      return `
        ${bucketExpr} AS bucket,
        (ARRAY_AGG(low_profit ORDER BY timestamp DESC))[1]::float AS low_profit,
        (ARRAY_AGG(high_profit ORDER BY timestamp DESC))[1]::float AS high_profit
      `;
    }

    return `
      ${bucketExpr} AS bucket,
      (ARRAY_AGG(low_profit ORDER BY timestamp ASC))[1]::float AS open_low,
      MAX(low_profit)::float AS high_low,
      MIN(low_profit)::float AS low_low,
      (ARRAY_AGG(low_profit ORDER BY timestamp DESC))[1]::float AS close_low,
      (ARRAY_AGG(high_profit ORDER BY timestamp ASC))[1]::float AS open_high,
      MAX(high_profit)::float AS high_high,
      MIN(high_profit)::float AS low_high,
      (ARRAY_AGG(high_profit ORDER BY timestamp DESC))[1]::float AS close_high
    `;
  }

  private buildRollupSelectClause(agg: HistoryAgg, bucketExpr: string): string {
    if (agg === HistoryAgg.AVG) {
      return `
        ${bucketExpr} AS bucket,
        (SUM(low_profit_sum) / NULLIF(SUM(samples), 0))::float AS low_profit,
        (SUM(high_profit_sum) / NULLIF(SUM(samples), 0))::float AS high_profit
      `;
    }

    if (agg === HistoryAgg.CLOSE) {
      return `
        ${bucketExpr} AS bucket,
        (ARRAY_AGG(close_low_profit ORDER BY close_timestamp DESC))[1]::float AS low_profit,
        (ARRAY_AGG(close_high_profit ORDER BY close_timestamp DESC))[1]::float AS high_profit
      `;
    }

    return `
      ${bucketExpr} AS bucket,
      (ARRAY_AGG(open_low_profit ORDER BY open_timestamp ASC))[1]::float AS open_low,
      MAX(low_profit_max)::float AS high_low,
      MIN(low_profit_min)::float AS low_low,
      (ARRAY_AGG(close_low_profit ORDER BY close_timestamp DESC))[1]::float AS close_low,
      (ARRAY_AGG(open_high_profit ORDER BY open_timestamp ASC))[1]::float AS open_high,
      MAX(high_profit_max)::float AS high_high,
      MIN(high_profit_min)::float AS low_high,
      (ARRAY_AGG(close_high_profit ORDER BY close_timestamp DESC))[1]::float AS close_high
    `;
  }

  private async query15mHistory(
    variantId: string,
    from: Date,
    to: Date,
    granularity: HistoryGranularity,
    agg: HistoryAgg,
  ): Promise<Record<string, unknown>[]> {
    const bucketExpr = this.build15mBucketExpression(granularity);

    return this.history15mRepo.query(
      `
        SELECT ${this.buildRollupSelectClause(agg, bucketExpr)}
        FROM variant_history_15m
        WHERE variant_id = $1
          AND bucket_start >= $2
          AND bucket_start <= $3
        GROUP BY bucket
        ORDER BY bucket
      `,
      [variantId, from.toISOString(), to.toISOString()],
    );
  }

  private async queryDailyHistory(
    variantId: string,
    from: Date,
    to: Date,
    granularity: HistoryGranularity,
    agg: HistoryAgg,
  ): Promise<Record<string, unknown>[]> {
    const bucketExpr = this.buildDailyBucketExpression(granularity);

    return this.dailyHistoryRepo.query(
      `
        SELECT ${this.buildRollupSelectClause(agg, bucketExpr)}
        FROM variant_history_daily
        WHERE variant_id = $1
          AND bucket_date >= ($2::timestamptz AT TIME ZONE 'UTC')::date
          AND bucket_date <= ($3::timestamptz AT TIME ZONE 'UTC')::date
        GROUP BY bucket
        ORDER BY bucket
      `,
      [variantId, from.toISOString(), to.toISOString()],
    );
  }

  private async findEarliestDailyHistoryTimestamp(variantId: string): Promise<Date | null> {
    const rows: Array<{ min: string | null }> = await this.dailyHistoryRepo.query(
      `
        SELECT MIN(bucket_date::timestamp AT TIME ZONE 'UTC') AS min
        FROM variant_history_daily
        WHERE variant_id = $1
      `,
      [variantId],
    );

    const value = rows[0]?.min;
    if (!value) {
      return null;
    }

    const earliest = new Date(value);
    return Number.isNaN(earliest.getTime()) ? null : earliest;
  }

  @Cron('17 * * * *')
  async handlePruneHistoryCron(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }

    await this.pruneHistory();
  }

  async pruneHistory(): Promise<void> {
    if (!this.pruneEnabled) {
      return;
    }

    const startedAt = Date.now();
    const lockValue = await this.acquireLock(this.pruneLockKey, this.pruneLockTtlSeconds);
    if (!lockValue) {
      this.logger.log(
        `prune skipped reason=lock_not_acquired durationMs=${Date.now() - startedAt}`,
      );
      return;
    }

    try {
      const rawDelete = await this.historyRepo
        .createQueryBuilder()
        .delete()
        .from(VariantHistory)
        .where(`timestamp < now() - interval '${this.rawRetentionHours} hours'`)
        .execute();

      const history15mDelete = await this.history15mRepo
        .createQueryBuilder()
        .delete()
        .from(VariantHistory15m)
        .where(`bucket_start < now() - interval '${this.history15mRetentionDays} days'`)
        .execute();

      this.logger.log(
        `prune completed durationMs=${Date.now() - startedAt} rawDeleted=${rawDelete.affected ?? 0} intraday15mDeleted=${history15mDelete.affected ?? 0} rawRetentionHours=${this.rawRetentionHours} history15mRetentionDays=${this.history15mRetentionDays}`,
      );
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`prune failed durationMs=${Date.now() - startedAt}`, stack);
      throw error;
    } finally {
      await this.releaseLock(this.pruneLockKey, lockValue);
    }
  }

  async getHistory(
    variantId: string,
    query: VariantHistoryQueryDto,
  ): Promise<{
    history: unknown[];
    snapshots: Pick<VariantSnapshot, 'snapshotDate' | 'snapshotDescription' | 'snapshotName'>[];
  }> {
    const range = query.range ?? HistoryRange.RANGE_1M;
    const agg = query.agg ?? HistoryAgg.AVG;
    const tz = query.tz ?? 'Europe/London';
    const now = new Date();
    let from: Date;

    if (range === HistoryRange.RANGE_ALL) {
      const earliest = await this.findEarliestDailyHistoryTimestamp(variantId);
      if (!earliest) {
        return { history: [], snapshots: [] };
      }

      from = earliest;
    } else {
      const diff: Record<HistoryRange, number> = {
        [HistoryRange.RANGE_24H]: 24 * 60 * 60 * 1000,
        [HistoryRange.RANGE_1W]: 7 * 24 * 60 * 60 * 1000,
        [HistoryRange.RANGE_1M]: 30 * 24 * 60 * 60 * 1000,
        [HistoryRange.RANGE_1Y]: 365 * 24 * 60 * 60 * 1000,
        [HistoryRange.RANGE_ALL]: 0,
      };
      from = new Date(now.getTime() - diff[range]);
    }

    const granularityParam = query.granularity ?? HistoryGranularity.AUTO;
    const granSecs: Record<HistoryGranularity, number> = {
      [HistoryGranularity.MIN_10]: 600,
      [HistoryGranularity.MIN_30]: 1800,
      [HistoryGranularity.HOUR_2]: 7200,
      [HistoryGranularity.DAY_1]: 86400,
      [HistoryGranularity.WEEK_1]: 604800,
      [HistoryGranularity.MONTH_1]: 30 * 24 * 60 * 60,
      [HistoryGranularity.AUTO]: 0,
    };

    const diffSeconds = (now.getTime() - from.getTime()) / 1000;
    let granularity = granularityParam;
    if (granularityParam === HistoryGranularity.AUTO) {
      const order = [
        HistoryGranularity.MIN_10,
        HistoryGranularity.MIN_30,
        HistoryGranularity.HOUR_2,
        HistoryGranularity.DAY_1,
        HistoryGranularity.WEEK_1,
        HistoryGranularity.MONTH_1,
      ];

      for (const candidate of order) {
        if (diffSeconds / granSecs[candidate] <= 400) {
          granularity = candidate;
          break;
        }
      }

      if (granularity === HistoryGranularity.AUTO) {
        granularity = HistoryGranularity.MONTH_1;
      }
    }

    granularity = this.normalizeGranularity(range, granularity);

    let rows: Record<string, unknown>[];
    if (this.shouldUseDailyHistory(range, granularity)) {
      rows = await this.queryDailyHistory(variantId, from, now, granularity, agg);
    } else if (this.shouldUse15mHistory(range, granularity, from, now)) {
      rows = await this.query15mHistory(variantId, from, now, granularity, agg);
    } else {
      const params: unknown[] = [variantId, from.toISOString(), now.toISOString()];

      let bucketExpr = '';
      if (
        granularity === HistoryGranularity.MIN_10 ||
        granularity === HistoryGranularity.MIN_30 ||
        granularity === HistoryGranularity.HOUR_2
      ) {
        const sec = granSecs[granularity];
        bucketExpr = `to_timestamp(floor(extract(epoch from timestamp) / ${sec}) * ${sec})`;
      } else {
        const trunc =
          granularity === HistoryGranularity.DAY_1
            ? 'day'
            : granularity === HistoryGranularity.WEEK_1
              ? 'week'
              : 'month';
        const paramIndex = params.length + 1;
        bucketExpr = `date_trunc('${trunc}', timestamp AT TIME ZONE $${paramIndex}) AT TIME ZONE $${paramIndex}`;
        params.push(tz);
      }

      rows = await this.historyRepo.query(
        `
          SELECT ${this.buildRawSelectClause(agg, bucketExpr)}
          FROM variant_history
          WHERE variant_id = $1 AND timestamp >= $2 AND timestamp <= $3
          GROUP BY bucket
          ORDER BY bucket
        `,
        params,
      );
    }

    const history =
      agg === HistoryAgg.OHLC
        ? rows.map((row) => ({
            timestamp: row.bucket,
            lowProfit: {
              open: Number(row.open_low),
              high: Number(row.high_low),
              low: Number(row.low_low),
              close: Number(row.close_low),
            },
            highProfit: {
              open: Number(row.open_high),
              high: Number(row.high_high),
              low: Number(row.low_high),
              close: Number(row.close_high),
            },
          }))
        : rows.map((row) => ({
            timestamp: row.bucket,
            lowProfit: Number(row.low_profit),
            highProfit: Number(row.high_profit),
          }));

    const snapshots = (
      await this.snapshotRepo
        .createQueryBuilder('snapshot')
        .where('snapshot.variant_id = :variantId', { variantId })
        .andWhere('snapshot.snapshotDate >= :from', { from })
        .andWhere('snapshot.snapshotDate <= :to', { to: now })
        .orderBy('snapshot.snapshotDate', 'ASC')
        .getMany()
    ).map((snapshot) => ({
      snapshotDate: snapshot.snapshotDate,
      snapshotDescription: snapshot.snapshotDescription,
      snapshotName: snapshot.snapshotName,
    }));

    return { history, snapshots };
  }
}
