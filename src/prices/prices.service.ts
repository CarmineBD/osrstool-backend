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
  private readonly api = 'https://prices.runescape.wiki/api/v1/osrs/latest';
  private readonly pricesHashKey = 'items:prices';
  private readonly legacyJsonKey = 'itemsPrices';
  private readonly changeWindowSeconds: number;
  private isFirstFetch = true;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL') as string;
    this.redis = new Redis(redisUrl);

    const rawWindow = this.config.get<string>('PRICE_CHANGE_WINDOW_SECONDS');
    const parsedWindow = rawWindow ? Number.parseInt(rawWindow, 10) : NaN;
    this.changeWindowSeconds =
      Number.isFinite(parsedWindow) && parsedWindow > 0 ? parsedWindow : 120;
  }

  async onModuleInit() {
    this.logger.log('Fetching initial prices snapshot');
    await this.fetchPrices(true);
  }

  @Cron('*/1 * * * *')
  async fetchPrices(forceFull = false) {
    try {
      const { data } = await firstValueFrom(
        this.http.get<{ data: Record<string, Price> }>(this.api),
      );

      const changedEntries: Array<[string, Price]> = [];
      const now = Math.floor(Date.now() / 1000);
      const cutoff = now - this.changeWindowSeconds;
      const shouldForceFull = forceFull || this.isFirstFetch;

      for (const [id, latest] of Object.entries(data.data)) {
        if (shouldForceFull) {
          changedEntries.push([id, latest]);
          continue;
        }

        const highTime = latest.highTime ?? 0;
        const lowTime = latest.lowTime ?? 0;
        if (highTime > cutoff || lowTime > cutoff) {
          changedEntries.push([id, latest]);
        }
      }

      if (changedEntries.length === 0) {
        const modeLabel = shouldForceFull ? 'full' : 'window';
        this.logger.log(
          `No recent price changes detected (mode=${modeLabel}, window=${this.changeWindowSeconds}s)`,
        );
        return;
      }

      const args: string[] = [];
      for (const [id, price] of changedEntries) {
        args.push(id, JSON.stringify(price));
      }
      await this.redis.call('HSET', this.pricesHashKey, ...args);
      this.isFirstFetch = false;

      const modeLabel = shouldForceFull ? 'full' : 'window';
      this.logger.log(
        `Prices updated in ${this.pricesHashKey}: ${changedEntries.length} items changed (mode=${modeLabel}, window=${this.changeWindowSeconds}s)`,
      );
    } catch (error) {
      this.logger.error('Error fetching prices', error);
    }
  }

  async getMany(ids: number[]) {
    if (ids.length === 0) return {};

    const fields = ids.map(String);
    const raw: unknown = await this.redis.call('HMGET', this.pricesHashKey, ...fields);
    const rows = this.isUnknownArray(raw) ? raw : [];

    const result: Record<number, { high: number; low: number; highTime: number; lowTime: number }> =
      {};

    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const rawPrice = rows[i];
      if (typeof rawPrice !== 'string') continue;

      try {
        const parsed: unknown = JSON.parse(rawPrice);
        if (!this.isPrice(parsed)) {
          this.logger.warn(`Invalid price JSON for item ${id}`, parsed);
          continue;
        }
        const p = parsed;
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
  private isPrice(value: unknown): value is Price {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    if (typeof candidate.low !== 'number') return false;
    if (candidate.high !== undefined && typeof candidate.high !== 'number') return false;
    if (candidate.lowTime !== undefined && typeof candidate.lowTime !== 'number') return false;
    if (candidate.highTime !== undefined && typeof candidate.highTime !== 'number') return false;

    return true;
  }

  private isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }
}
