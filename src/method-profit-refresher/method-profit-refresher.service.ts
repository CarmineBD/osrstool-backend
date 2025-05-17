// src/method-profit-refresher/method-profit-refresher.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { MethodsService } from '../methods/methods.service';
import { PricesService } from '../prices/prices.service';

interface Price {
  high?: number;
  low: number;
}
interface Profit {
  low: number;
  high: number;
}

@Injectable()
export class MethodProfitRefresherService {
  private readonly logger = new Logger(MethodProfitRefresherService.name);
  private readonly redis = new Redis(process.env.REDIS_URL!);

  constructor(
    private readonly methodsService: MethodsService,
    private readonly pricesService: PricesService,
  ) {}

  @Cron('*/1 * * * *') // cada minuto
  async refresh(): Promise<void> {
    const { data: methods } = await this.methodsService.findAll(1, 1000);
    if (methods.length === 0) {
      this.logger.log('No hay métodos que refrescar');
      return;
    }

    // 3) Reunir todos los IDs de ítems (inputs y outputs)
    const itemIds = new Set<number>();
    for (const m of methods) {
      m.inputs.forEach((i) => itemIds.add(i.id));
      m.outputs.forEach((o) => itemIds.add(o.id));
    }

    // 4) Traer precios
    const raw = await this.pricesService.getMany([...itemIds]);
    const prices: Record<number, Price> = raw as Record<number, Price>;

    // 5) Calcular profits por método
    const profits: Record<string, Profit> = {};
    for (const m of methods) {
      const sum = (arr: { id: number; quantity: number }[], field: keyof Price) =>
        arr.reduce((acc, { id, quantity }) => {
          const p = prices[id];
          if (!p) return acc;
          const unit = field === 'high' ? (p.high ?? p.low) : p.low;
          return acc + unit * quantity;
        }, 0);

      const inputsHigh = sum(m.inputs, 'high');
      const inputsLow = sum(m.inputs, 'low');
      const outputsHigh = sum(m.outputs, 'high');
      const outputsLow = sum(m.outputs, 'low');

      profits[m.id] = {
        low: outputsLow - inputsHigh, // peor caso
        high: outputsHigh - inputsLow, // mejor caso
      };
    }

    // 6) Guardar resultado en Redis
    await this.redis.call('JSON.SET', 'methodsProfits', '$', JSON.stringify(profits));
    this.logger.log(`🔄 Actualizado methodsProfits (${methods.length} métodos)`);
  }
}
