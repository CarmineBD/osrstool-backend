import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { MethodsService } from '../methods/methods.service';
import { PricesService } from '../prices/prices.service';
import { ConfigService } from '@nestjs/config';

// interface Price {
//   high?: number;
//   low: number;
// }
// interface Profit {
//   low: number;
//   high: number;
// }

@Injectable()
export class MethodProfitRefresherService {
  private readonly logger = new Logger(MethodProfitRefresherService.name);
  private readonly redis: Redis;

  constructor(
    private readonly methodsService: MethodsService,
    private readonly pricesService: PricesService,
    private readonly config: ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL') as string;
    this.redis = new Redis(redisUrl);
  }

  @Cron('*/1 * * * *') // cada minuto
  async refresh(): Promise<void> {
    const { data: methods } = await this.methodsService.findAll(1, 1000);
    if (methods.length === 0) {
      this.logger.log('No hay métodos que refrescar');
      return;
    }

    // 1) Reunir todos los IDs de ítems (de cada variante: inputs y outputs)
    const itemIds = new Set<number>();
    for (const method of methods) {
      for (const variant of method.variants) {
        variant.inputs.forEach((i) => itemIds.add(i.id));
        variant.outputs.forEach((o) => itemIds.add(o.id));
      }
    }

    // 2) Traer precios desde Redis
    const raw = await this.pricesService.getMany([...itemIds]);
    const prices: Record<number, { high?: number; low: number }> = raw;

    // 3) Calcular profits por variante de cada método
    const profits: Record<string, Record<string, { low: number; high: number }>> = {};
    for (const method of methods) {
      profits[method.id] = {};
      method.variants.forEach((variant) => {
        const sum = (arr: { id: number; quantity: number }[], field: 'high' | 'low') =>
          arr.reduce((acc, { id, quantity }) => {
            const p = prices[id];
            if (!p) return acc;
            const unit = field === 'high' ? (p.high ?? p.low) : p.low;
            return acc + unit * quantity;
          }, 0);

        const outputsLow = sum(variant.outputs, 'low');
        const outputsHigh = sum(variant.outputs, 'high');
        const inputsHigh = sum(variant.inputs, 'high');
        const inputsLow = sum(variant.inputs, 'low');

        const lowProfit = outputsLow - inputsHigh;
        const highProfit = outputsHigh - inputsLow;

        // Usamos directamente el id de la variante
        profits[method.id][variant.id] = { low: lowProfit, high: highProfit };
      });
    }

    // 4) Guardar resultado en Redis
    await this.redis.call('JSON.SET', 'methodsProfits', '$', JSON.stringify(profits));
    this.logger.log(`🔄 Actualizado methodsProfits (${methods.length} métodos)`);
  }
}
