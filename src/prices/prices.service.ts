import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface Price {
  high?: number;
  low: number;
}

@Injectable()
export class PricesService implements OnModuleInit {
  private readonly logger = new Logger(PricesService.name);
  private readonly redis = new Redis(process.env.REDIS_URL!);
  private readonly API = 'https://prices.runescape.wiki/api/v1/osrs/latest';

  private lastData: Record<string, Price> = {};

  constructor(private readonly http: HttpService) {}

  /**
   * On init, load snapshot or fetch fresh data
   */
  async onModuleInit() {
    try {
      // Typed call to return array of strings
      const fullRaw = await this.redis.call('JSON.GET', 'itemsPrices', '$');
      console.log('⛏️ raw tipo:', typeof fullRaw);
      console.log(
        '⛏️ raw primeros 100 chars:',
        (typeof fullRaw === 'string' ? fullRaw : JSON.stringify(fullRaw)).slice(0, 100),
      );

      const full = Array.isArray(fullRaw) ? (fullRaw as string[]) : [];
      if (Array.isArray(full) && typeof full[0] === 'string') {
        const raw = full[0];
        try {
          // JSON.parse with explicit typing
          const parsed = JSON.parse(raw) as Record<string, Price> | Array<Record<string, Price>>;
          if (Array.isArray(parsed)) {
            this.lastData = parsed[0];
          } else {
            this.lastData = parsed;
          }
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

      // Detectamos diffs
      let hasChanges = false;
      for (const [id, price] of Object.entries(data.data)) {
        const prev = this.lastData[id];
        if (!prev || prev.low !== price.low || prev.high !== price.high) {
          this.lastData[id] = price;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        const payload = JSON.stringify(this.lastData);
        await this.redis.call('JSON.SET', 'itemsPrices', '$', payload);
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
    // 🔥 Sin '$', RedisJSON devuelve directamente el JSON string del objeto
    const raw = await this.redis.call('JSON.GET', 'itemsPrices');
    if (typeof raw !== 'string') {
      throw new Error(`Esperaba string de JSON.GET, recibí: ${JSON.stringify(raw)}`);
    }

    // raw === '{"2":{…},"6":{…},…}'  ← perfecto
    const all = JSON.parse(raw) as Record<string, { high?: number; low: number }>;

    const result: Record<number, { high: number; low: number }> = {};
    for (const id of ids) {
      const p = all[id];
      if (p) result[id] = { high: p.high ?? p.low, low: p.low };
    }
    return result;
  }
}
