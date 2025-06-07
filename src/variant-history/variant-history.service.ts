import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { VariantHistory } from '../methods/entities/variant-history.entity';
import { MethodVariant } from '../methods/entities/variant.entity';

@Injectable()
export class VariantHistoryService {
  private readonly logger = new Logger(VariantHistoryService.name);
  private readonly redis = new Redis(process.env.REDIS_URL!);

  constructor(
    @InjectRepository(VariantHistory)
    private readonly historyRepo: Repository<VariantHistory>,
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

    await this.historyRepo.save(records);
    this.logger.log(`Stored ${records.length} variant profit snapshots`);
  }
}
