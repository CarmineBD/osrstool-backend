import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { VariantHistory } from '../methods/entities/variant-history.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';

@Injectable()
export class VariantHistoryService {
  private readonly logger = new Logger(VariantHistoryService.name);
  private readonly redis = new Redis(process.env.REDIS_URL!);

  constructor(
    @InjectRepository(VariantHistory)
    private readonly historyRepo: Repository<VariantHistory>,
    @InjectRepository(VariantSnapshot)
    private readonly snapshotRepo: Repository<VariantSnapshot>,
  ) {}

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
    from?: string,
    to?: string,
  ): Promise<{
    history: VariantHistory[];
    snapshots: Pick<VariantSnapshot, 'snapshotDate' | 'snapshotDescription' | 'snapshotName'>[];
  }> {
    const qb = this.historyRepo
      .createQueryBuilder('history')
      .where('history.variant_id = :variantId', { variantId });

    if (from) qb.andWhere('history.timestamp >= :from', { from });
    if (to) qb.andWhere('history.timestamp <= :to', { to });

    const history = await qb.orderBy('history.timestamp', 'ASC').getMany();

    const snapshotQb = this.snapshotRepo
      .createQueryBuilder('snapshot')
      .where('snapshot.variant_id = :variantId', { variantId });

    if (from) snapshotQb.andWhere('snapshot.snapshotDate >= :from', { from });
    if (to) snapshotQb.andWhere('snapshot.snapshotDate <= :to', { to });

    const rawSnapshots = await snapshotQb.orderBy('snapshot.snapshotDate', 'ASC').getMany();

    const snapshots = rawSnapshots.map((s) => ({
      snapshotDate: s.snapshotDate,
      snapshotDescription: s.snapshotDescription,
      snapshotName: s.snapshotName,
    }));

    return { history, snapshots };
  }
}
