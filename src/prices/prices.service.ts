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

      const updatedIds: string[] = [];
      for (const [id, price] of Object.entries(data.data)) {
        const prev = this.lastData[id];
        if (!prev || prev.low !== price.low || prev.high !== price.high) {
          this.lastData[id] = price;
          updatedIds.push(id);
        }
      }

      if (updatedIds.length > 0) {
        const args: (string | Buffer)[] = ['itemsPrices'];
        let bytesSent = 0;
        for (const id of updatedIds) {
          const path = `$.${id}`;
          const payload = JSON.stringify(this.lastData[id]);
          args.push(path, payload);
          bytesSent += Buffer.byteLength(payload, 'utf8');
        }
        await this.redis.call('JSON.SET', ...args);
        const commandsUsed = 1;
        const kbSent = (bytesSent / 1024).toFixed(2);
        this.logger.log(
          `Updated ${updatedIds.length} items; commands: ${commandsUsed}; bandwidth: ${kbSent} KB`,
        );
      } else {
        this.logger.log('No price changes detected');
      }
    } catch (err) {
      this.logger.error('Error fetching prices', err);
    }
  }
}
