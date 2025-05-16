// src/method-profit-refresher/method-profit-refresher.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { MethodsService } from '../methods/methods.service';
import { PricesService } from '../prices/prices.service';
import { MethodDto } from '../methods/dto/method.dto';

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
    const methods: MethodDto[] = this.methodsService.findAll();
    if (methods.length === 0) return;

    // 1) Reunir todos los IDs de items:
    const itemIds = new Set<number>();
    for (const m of methods) {
      m.inputs.forEach((i) => itemIds.add(i.id));
      m.outputs.forEach((o) => itemIds.add(o.id));
    }

    // 2) Traer precios
    const raw = await this.pricesService.getMany([...itemIds]);
    const prices: Record<number, Price> = raw as Record<number, Price>;

    // 3) Calcular profits
    const profits: Record<string, Profit> = {};

    for (const m of methods) {
      // helper para sumar inputs/outputs
      const sum = (arr: { id: number; quantity: number }[], pick: keyof Price) =>
        arr.reduce((acc, { id, quantity }) => {
          const p = prices[id];
          if (!p) return acc;
          const unit = pick === 'high' ? (p.high ?? p.low) : p.low;
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

    // 4) Guardar en Redis JSON
    await this.redis.call('JSON.SET', 'methodsProfits', '$', JSON.stringify(profits));

    this.logger.log(`🔄 Actualizado methodsProfits (${methods.length} métodos)`);
  }
}
