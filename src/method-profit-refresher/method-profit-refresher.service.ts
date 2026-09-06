import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import IORedis, { Redis } from 'ioredis';
import { MethodsService } from '../methods/methods.service';
import { PricesService } from '../prices/prices.service';
import { ConfigService } from '@nestjs/config';
import { parseBooleanEnv } from '../common/utils/parse-boolean-env';
import { RedisService } from '../redis/redis.service';
import { METHODS_PROFITS_HASH_KEY } from '../methods/profit-cache.constants';
import { CalculationMode } from '../methods/calculation-mode.enum';
import { calculateDynamicVariant } from '../methods/dynamic-variant-calculator';

interface ProfitValues {
  low: number;
  high: number;
}

@Injectable()
export class MethodProfitRefresherService implements OnModuleInit {
  private readonly logger = new Logger(MethodProfitRefresherService.name);
  private readonly redis: Redis;
  private readonly methodsProfitsHashKey = METHODS_PROFITS_HASH_KEY;
  private readonly jobsEnabled: boolean;

  constructor(
    private readonly methodsService: MethodsService,
    private readonly pricesService: PricesService,
    private readonly config: ConfigService,
    @Optional() redisService?: RedisService,
  ) {
    this.redis =
      redisService?.getClient() ??
      new IORedis((this.config.get<string>('REDIS_URL') as string) ?? '');
    this.jobsEnabled = parseBooleanEnv(
      this.config.get<string>('METHOD_PROFIT_REFRESHER_ENABLED'),
      parseBooleanEnv(this.config.get<string>('SCHEDULED_JOBS_ENABLED'), true),
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.jobsEnabled) {
      this.logger.log('Skipping initial profit refresh (METHOD_PROFIT_REFRESHER_ENABLED=false).');
      return;
    }

    await this.refresh();
  }

  @Cron('*/1 * * * *') // cada minuto
  async handleRefreshCron(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }

    await this.refresh();
  }

  async refresh(): Promise<void> {
    const { data: methods } = await this.methodsService.findAll(1, 1000);
    if (methods.length === 0) {
      await this.redis.call('DEL', this.methodsProfitsHashKey);
      this.logger.log('No hay metodos que refrescar');
      return;
    }

    // 1) Reunir todos los IDs de items (de cada variante: inputs y outputs)
    const itemIds = new Set<number>();
    for (const method of methods) {
      for (const variant of method.variants) {
        variant.inputs.forEach((i) => itemIds.add(i.id));
        variant.outputs.forEach((o) => itemIds.add(o.id));
        if (variant.calculationMode === CalculationMode.DYNAMIC) {
          variant.action?.inputs.forEach((i) => itemIds.add(i.id));
          variant.action?.outputs.forEach((o) => itemIds.add(o.id));
        }
      }
    }

    // 2) Traer precios desde Redis
    const raw = await this.pricesService.getMany([...itemIds]);
    const prices: Record<number, { high?: number; low: number }> = raw;

    // 3) Calcular profits por variante de cada metodo
    const profits: Record<
      string,
      Record<string, ProfitValues & Partial<Record<'historyLow' | 'historyHigh', number>>>
    > = {};
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

        const calculateProfit = (
          inputs: { id: number; quantity: number }[],
          outputs: { id: number; quantity: number }[],
        ): ProfitValues => ({
          low: sum(outputs, 'low') - sum(inputs, 'high'),
          high: sum(outputs, 'high') - sum(inputs, 'low'),
        });

        const profit = calculateProfit(variant.inputs, variant.outputs);
        const historyProfit =
          variant.calculationMode === CalculationMode.DYNAMIC &&
          variant.action &&
          variant.cycleSteps
            ? (() => {
                const calculation = calculateDynamicVariant(
                  {
                    id: variant.action.id,
                    name: variant.action.name,
                    rollIntervalTicks: variant.action.rollIntervalTicks,
                    baseSuccessChance: 1,
                    inputs: variant.action.inputs.map(({ id, quantity, condition }) => ({
                      itemId: id,
                      quantity,
                      condition,
                    })),
                    outputs: variant.action.outputs.map(({ id, quantity, condition }) => ({
                      itemId: id,
                      quantity,
                      condition,
                    })),
                  },
                  variant.cycleSteps,
                );
                return calculateProfit(calculation.inputs, calculation.outputs);
              })()
            : null;

        profits[method.id][variant.id] = {
          ...profit,
          ...(historyProfit
            ? { historyLow: historyProfit.low, historyHigh: historyProfit.high }
            : {}),
        };
      });
    }

    // 4) Publicar un snapshot completo de forma atómica. Los lectores nunca
    // observan el hash vacío entre un DEL y el HSET, algo importante para el
    // capturador de histórico que puede ejecutarse a la vez.
    const entries: string[] = [];
    for (const [methodId, methodProfits] of Object.entries(profits)) {
      entries.push(methodId, JSON.stringify(methodProfits));
    }

    const temporaryKey = `${this.methodsProfitsHashKey}:refresh:${Date.now()}`;
    const transaction = this.redis.multi();
    transaction.call('DEL', temporaryKey);
    transaction.call('HSET', temporaryKey, ...entries);
    transaction.call('RENAME', temporaryKey, this.methodsProfitsHashKey);
    await transaction.exec();

    this.logger.log(`Actualizado ${this.methodsProfitsHashKey} (${methods.length} metodos)`);
  }
}
