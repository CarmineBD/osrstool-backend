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

  // In-memory snapshot used only to detect high/low changes between polls.
  private lastData: Record<string, Price> = {};

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL') as string;
    this.redis = new Redis(redisUrl);
  }

  async onModuleInit() {
    try {
      const snapshot = await this.loadSnapshotFromHash();
      if (Object.keys(snapshot).length > 0) {
        this.lastData = snapshot;
        this.logger.log('Initial prices snapshot loaded from items:prices hash');
        return;
      }

      const legacySnapshot = await this.loadSnapshotFromLegacyJson();
      if (Object.keys(legacySnapshot).length > 0) {
        this.lastData = legacySnapshot;
        this.logger.log('Initial prices snapshot loaded from legacy itemsPrices key');
        return;
      }

      this.logger.log('No prices snapshot found, fetching fresh data');
      await this.fetchPrices();
    } catch (error) {
      this.logger.error('Error loading initial snapshot, fetching fresh data', error);
      await this.fetchPrices();
    }
  }

  @Cron('*/1 * * * *')
  async fetchPrices() {
    try {
      const { data } = await firstValueFrom(
        this.http.get<{ data: Record<string, Price> }>(this.api),
      );

      const changedEntries: Array<[string, Price]> = [];

      for (const [id, latest] of Object.entries(data.data)) {
        const previous = this.lastData[id];
        const hasPriceChanged =
          !previous ||
          (previous.high ?? previous.low) !== (latest.high ?? latest.low) ||
          previous.low !== latest.low;

        if (hasPriceChanged) {
          changedEntries.push([id, latest]);
          this.lastData[id] = latest;
        }
      }

      if (changedEntries.length === 0) {
        this.logger.log('No high/low changes detected');
        return;
      }

      const args: string[] = [];
      for (const [id, price] of changedEntries) {
        args.push(id, JSON.stringify(price));
      }
      await this.redis.call('HSET', this.pricesHashKey, ...args);

      this.logger.log(
        `Prices updated in ${this.pricesHashKey}: ${changedEntries.length} items changed (high/low)`,
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

  private async loadSnapshotFromHash(): Promise<Record<string, Price>> {
    const raw = await this.redis.call('HGETALL', this.pricesHashKey);
    const fields = this.parseRedisHashResult(raw);
    const snapshot: Record<string, Price> = {};

    for (let i = 0; i < fields.length; i += 2) {
      const id = fields[i];
      const value = fields[i + 1];
      if (!id || typeof value !== 'string') continue;

      try {
        snapshot[id] = JSON.parse(value) as Price;
      } catch (error) {
        this.logger.warn(`Invalid hash payload for item ${id}`, error);
      }
    }

    return snapshot;
  }

  private async loadSnapshotFromLegacyJson(): Promise<Record<string, Price>> {
    const raw = await this.redis.call('JSON.GET', this.legacyJsonKey);
    if (typeof raw !== 'string') return {};

    const parsed = JSON.parse(raw) as Record<string, Price>;
    return parsed ?? {};
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

  private parseRedisHashResult(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw.map((entry) => (typeof entry === 'string' ? entry : String(entry)));
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw as Record<string, string>).flatMap(([k, v]) => [k, v]);
    }

    return [];
  }
}
