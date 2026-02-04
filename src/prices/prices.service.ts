import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

interface Price {
  high?: number;
  highTime?: number;
  low: number;
  lowTime?: number;
}

@Injectable()
export class PricesService implements OnModuleInit {
  private readonly logger = new Logger(PricesService.name);
  private readonly redis: Redis;
  private readonly API = 'https://prices.runescape.wiki/api/v1/osrs/latest';
  private readonly pricesHashKey = 'items:prices';
  private readonly legacyJsonKey = 'itemsPrices';

  private lastData: Record<string, Price> = {};

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL') as string;
    this.redis = new Redis(redisUrl);
  }

  /**
   * On init, load snapshot or fetch fresh data
   */
  async onModuleInit() {
    try {
      // Typed call to return array of strings
      const fullRaw = await this.redis.call('JSON.GET', this.legacyJsonKey, '$');

      const full = Array.isArray(fullRaw) ? (fullRaw as string[]) : [];
      if (Array.isArray(full) && typeof full[0] === 'string') {
        const raw = full[0];
        try {
          const parsed = JSON.parse(raw) as Record<string, Price> | Array<Record<string, Price>>;
          this.lastData = Array.isArray(parsed) ? (parsed[0] ?? {}) : parsed;
          this.logger.log('Initial prices snapshot loaded');
        } catch (parseErr) {
          this.logger.warn('Invalid snapshot JSON, fetching fresh data: ', parseErr);
          await this.fetchPrices();
        }
      } else {
        this.logger.log('No snapshot found, fetching fresh data');
        await this.fetchPrices();
      }
    } catch (err) {
      this.logger.error('Error loading initial snapshot, fetching fresh data', err);
      await this.fetchPrices();
    }
  }

  @Cron('*/1 * * * *')
  async fetchPrices() {
    try {
      const { data } = await firstValueFrom(
        this.http.get<{ data: Record<string, Price> }>(this.API),
      );

      let hasChanges = false;
      for (const [id, price] of Object.entries(data.data)) {
        const prev = this.lastData[id];
        if (
          !prev ||
          prev.low !== price.low ||
          prev.high !== price.high ||
          prev.lowTime !== price.lowTime ||
          prev.highTime !== price.highTime
        ) {
          this.lastData[id] = price;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        const payload = JSON.stringify(this.lastData);
        await this.redis.call('JSON.SET', this.legacyJsonKey, '$', payload);
        const kbSent = (Buffer.byteLength(payload, 'utf8') / 1024).toFixed(2);
        this.logger.log(`Snapshot rewritten; commands: 1; bandwidth: ${kbSent} KB`);
      } else {
        this.logger.log('No price changes detected');
      }
    } catch (err) {
      this.logger.error('Error fetching prices', err);
    }
  }

  async getMany(ids: number[]) {
    if (ids.length === 0) return {};

    const fields = ids.map(String);
    const raw = (await this.redis.call('HMGET', this.pricesHashKey, ...fields)) as unknown;
    const rows = Array.isArray(raw) ? raw : [];

    const result: Record<number, { high: number; low: number; highTime: number; lowTime: number }> =
      {};

    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const rawPrice = rows[i];
      if (typeof rawPrice !== 'string') continue;

      try {
        const p = JSON.parse(rawPrice) as Price;
        result[id] = {
          high: p.high ?? p.low,
          low: p.low,
          highTime: p.highTime ?? 0,
          lowTime: p.lowTime ?? 0,
        };
      } catch (error) {
        this.logger.warn(`Invalid price JSON for item ${id}`, error);
      }
    }

    // Transitional fallback while data is still mirrored in legacy JSON key.
    if (Object.keys(result).length < ids.length) {
      const missingIds = ids.filter((id) => result[id] === undefined);
      if (missingIds.length > 0) {
        const legacyRaw = await this.redis.call('JSON.GET', this.legacyJsonKey);
        if (typeof legacyRaw === 'string') {
          const all = JSON.parse(legacyRaw) as Record<string, Price>;
          for (const id of missingIds) {
            const p = all[String(id)];
            if (!p) continue;
            result[id] = {
              high: p.high ?? p.low,
              low: p.low,
              highTime: p.highTime ?? 0,
              lowTime: p.lowTime ?? 0,
            };
          }
        }
      }
    }

    return result;
  }
}
