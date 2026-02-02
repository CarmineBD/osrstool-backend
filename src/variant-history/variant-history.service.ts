import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { VariantHistory } from '../methods/entities/variant-history.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';
import { ConfigService } from '@nestjs/config';
import {
  HistoryAgg,
  HistoryGranularity,
  HistoryRange,
  VariantHistoryQueryDto,
} from './dto/variant-history-query.dto';

@Injectable()
export class VariantHistoryService {
  private readonly logger = new Logger(VariantHistoryService.name);
  private readonly redis: Redis;

  constructor(
    @InjectRepository(VariantHistory)
    private readonly historyRepo: Repository<VariantHistory>,
    @InjectRepository(VariantSnapshot)
    private readonly snapshotRepo: Repository<VariantSnapshot>,
    private readonly config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL') as string;
    this.redis = new Redis(redisUrl);
  }

  @Cron('*/5 * * * *')
  async capture(): Promise<void> {
    const rawData = (await this.redis.call('JSON.GET', 'methodsProfits', '$')) as string | null;
    if (!rawData) {
      this.logger.warn('No profits found in Redis');
      return;
    }

    let profits: Record<string, Record<string, { low: number; high: number }>> = {};
    try {
      const parsed = JSON.parse(rawData) as Record<
        string,
        Record<string, { low: number; high: number }>
      >[];
      profits = Array.isArray(parsed) ? parsed[0] || {} : parsed;
    } catch {
      this.logger.warn('Invalid profits data in Redis');
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
      this.logger.log('No variant profits to save');
      return;
    }

    console.log('Saving variant history records:', records);
    await this.historyRepo.save(records);
    console.log('Saved variant history records successfully:', records);
    this.logger.log(`Stored ${records.length} variant profit snapshots`);
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
      const res = await this.historyRepo
        .createQueryBuilder('vh')
        .select('MIN(vh.timestamp)', 'min')
        .where('vh.variant_id = :variantId', { variantId })
        .getRawOne<{ min: string | null }>();

      if (!res?.min) {
        return { history: [], snapshots: [] };
      }
      from = new Date(res.min);
    } else {
      const diff: Record<HistoryRange, number> = {
        [HistoryRange.RANGE_24H]: 24 * 60 * 60 * 1000,
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
      for (const g of order) {
        if (diffSeconds / granSecs[g] <= 400) {
          granularity = g;
          break;
        }
      }
      if (granularity === HistoryGranularity.AUTO) {
        granularity = HistoryGranularity.MONTH_1;
      }
    }

    const params: any[] = [variantId, from.toISOString(), now.toISOString()];

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

    let selectClause = '';
    if (agg === HistoryAgg.AVG) {
      selectClause = `
        ${bucketExpr} AS bucket,
        AVG(low_profit)::float AS low_profit,
        AVG(high_profit)::float AS high_profit
      `;
    } else if (agg === HistoryAgg.CLOSE) {
      selectClause = `
        ${bucketExpr} AS bucket,
        (ARRAY_AGG(low_profit ORDER BY timestamp DESC))[1]::float AS low_profit,
        (ARRAY_AGG(high_profit ORDER BY timestamp DESC))[1]::float AS high_profit
      `;
    } else {
      selectClause = `
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

    const sql = `
      SELECT ${selectClause}
      FROM variant_history
      WHERE variant_id = $1 AND timestamp >= $2 AND timestamp <= $3
      GROUP BY bucket
      ORDER BY bucket
    `;

    const rows: Record<string, unknown>[] = await this.historyRepo.query(sql, params);

    let history: unknown[] = [];
    if (agg === HistoryAgg.OHLC) {
      history = rows.map((r) => ({
        timestamp: r.bucket,
        lowProfit: {
          open: Number(r.open_low),
          high: Number(r.high_low),
          low: Number(r.low_low),
          close: Number(r.close_low),
        },
        highProfit: {
          open: Number(r.open_high),
          high: Number(r.high_high),
          low: Number(r.low_high),
          close: Number(r.close_high),
        },
      }));
    } else {
      history = rows.map((r) => ({
        timestamp: r.bucket,
        lowProfit: Number(r.low_profit),
        highProfit: Number(r.high_profit),
      }));
    }

    const snapshotQb = this.snapshotRepo
      .createQueryBuilder('snapshot')
      .where('snapshot.variant_id = :variantId', { variantId })
      .andWhere('snapshot.snapshotDate >= :from', { from })
      .andWhere('snapshot.snapshotDate <= :to', { to: now })
      .orderBy('snapshot.snapshotDate', 'ASC');

    const rawSnapshots = await snapshotQb.getMany();

    const snapshots = rawSnapshots.map((s) => ({
      snapshotDate: s.snapshotDate,
      snapshotDescription: s.snapshotDescription,
      snapshotName: s.snapshotName,
    }));

    return { history, snapshots };
  }
}
