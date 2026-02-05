import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemPriceRule, ItemPriceRuleType } from './entities/item-price-rule.entity';

interface Price {
  high?: number;
  highTime?: number;
  low: number;
  lowTime?: number;
}

interface RecipeComponent {
  itemId: number;
  multipliedBy: number;
}

interface RecipeRuleParams {
  components: RecipeComponent[];
}

interface BestRecipeRuleParams {
  recipes: RecipeRuleParams[];
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
    @InjectRepository(ItemPriceRule)
    private readonly priceRuleRepo: Repository<ItemPriceRule>,
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

      const untradeableEntries = await this.buildUntradeableEntries(data.data, now);

      if (changedEntries.length === 0) {
        const modeLabel = shouldForceFull ? 'full' : 'window';
        this.logger.log(
          `No recent tradeable price changes detected (mode=${modeLabel}, window=${this.changeWindowSeconds}s)`,
        );
      }

      if (changedEntries.length > 0) {
        const args: string[] = [];
        for (const [id, price] of changedEntries) {
          args.push(id, JSON.stringify(price));
        }
        await this.redis.call('HSET', this.pricesHashKey, ...args);

        const modeLabel = shouldForceFull ? 'full' : 'window';
        this.logger.log(
          `Tradeable prices updated in ${this.pricesHashKey}: ${changedEntries.length} items changed (mode=${modeLabel}, window=${this.changeWindowSeconds}s)`,
        );
      }

      if (untradeableEntries.length > 0) {
        const args: string[] = [];
        for (const [id, price] of untradeableEntries) {
          args.push(id, JSON.stringify(price));
        }
        await this.redis.call('HSET', this.pricesHashKey, ...args);
        this.logger.log(
          `Untradeable prices updated in ${this.pricesHashKey}: ${untradeableEntries.length} items recalculated`,
        );
      } else {
        this.logger.log('No enabled untradeable price rules produced a value.');
      }

      this.isFirstFetch = false;
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

  private async buildUntradeableEntries(
    basePrices: Record<string, Price>,
    timestamp: number,
  ): Promise<Array<[string, Price]>> {
    const rules = await this.priceRuleRepo.find({ where: { isEnabled: true } });
    if (rules.length === 0) {
      return [];
    }

    const entries: Array<[string, Price]> = [];

    for (const rule of rules) {
      const computed = this.computeRulePrice(rule, basePrices, timestamp);
      if (computed) {
        entries.push([String(rule.itemId), computed]);
      }
    }

    return entries;
  }

  private computeRulePrice(
    rule: ItemPriceRule,
    basePrices: Record<string, Price>,
    timestamp: number,
  ): Price | null {
    switch (rule.ruleType) {
      case ItemPriceRuleType.FIXED: {
        const params = this.parseFixedParams(rule);
        if (!params) return null;
        return {
          low: params.low,
          high: params.high,
          lowTime: timestamp,
          highTime: timestamp,
        };
      }
      case ItemPriceRuleType.RECIPE: {
        const params = this.parseRecipeParams(rule);
        if (!params) return null;
        const totals = this.computeRecipeTotals(params.components, basePrices, rule);
        if (!totals) return null;
        return {
          low: totals.low,
          high: totals.high,
          lowTime: timestamp,
          highTime: timestamp,
        };
      }
      case ItemPriceRuleType.BEST_RECIPE: {
        const params = this.parseBestRecipeParams(rule);
        if (!params) return null;

        let bestLow: number | null = null;
        let bestHigh: number | null = null;

        for (const recipe of params.recipes) {
          const totals = this.computeRecipeTotals(recipe.components, basePrices, rule);
          if (!totals) continue;

          bestLow = bestLow === null ? totals.low : Math.min(bestLow, totals.low);
          bestHigh = bestHigh === null ? totals.high : Math.min(bestHigh, totals.high);
        }

        if (bestLow === null || bestHigh === null) {
          this.logger.warn(
            `Price rule ${rule.itemId} (${rule.ruleType}) skipped: no valid recipes`,
          );
          return null;
        }

        return {
          low: bestLow,
          high: bestHigh,
          lowTime: timestamp,
          highTime: timestamp,
        };
      }
      default: {
        const ruleType = String(rule.ruleType);
        this.logger.warn('Unsupported price rule type for item ' + rule.itemId + ': ' + ruleType);
        return null;
      }
    }
  }

  private parseFixedParams(rule: ItemPriceRule): { low: number; high: number } | null {
    const params = this.asRecord(rule.params);
    if (!params) {
      this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) has invalid params.`);
      return null;
    }

    const low = params.low;
    const high = params.high;

    if (!this.isFiniteNumber(low) || !this.isFiniteNumber(high)) {
      this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) has invalid fixed values.`);
      return null;
    }

    return { low, high };
  }

  private parseRecipeParams(rule: ItemPriceRule): RecipeRuleParams | null {
    const params = this.asRecord(rule.params);
    if (!params) {
      this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) has invalid params.`);
      return null;
    }

    const components = this.parseComponents(params.components, rule);
    if (!components) return null;

    return { components };
  }

  private parseBestRecipeParams(rule: ItemPriceRule): BestRecipeRuleParams | null {
    const params = this.asRecord(rule.params);
    if (!params) {
      this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) has invalid params.`);
      return null;
    }

    const rawRecipes = params.recipes;
    if (!Array.isArray(rawRecipes) || rawRecipes.length === 0) {
      this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) has no recipes.`);
      return null;
    }

    const recipes: RecipeRuleParams[] = [];

    rawRecipes.forEach((recipe, index) => {
      const recipeObj = this.asRecord(recipe);
      if (!recipeObj) {
        this.logger.warn(
          `Price rule ${rule.itemId} (${rule.ruleType}) has invalid recipe at index ${index}.`,
        );
        return;
      }

      const components = this.parseComponents(recipeObj.components, rule, index);
      if (!components) return;

      recipes.push({ components });
    });

    if (recipes.length === 0) {
      this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) has no valid recipes.`);
      return null;
    }

    return { recipes };
  }

  private parseComponents(
    raw: unknown,
    rule: ItemPriceRule,
    recipeIndex?: number,
  ): RecipeComponent[] | null {
    if (!Array.isArray(raw) || raw.length === 0) {
      const recipeLabel = recipeIndex === undefined ? '' : ` recipe ${recipeIndex}`;
      this.logger.warn(
        `Price rule ${rule.itemId} (${rule.ruleType}) has no components${recipeLabel}.`,
      );
      return null;
    }

    const components: RecipeComponent[] = [];

    for (const component of raw) {
      const componentObj = this.asRecord(component);
      if (!componentObj) {
        this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) has invalid components.`);
        return null;
      }

      const itemId = componentObj.itemId;
      const multipliedBy = componentObj.multipliedBy;

      if (!this.isFiniteNumber(itemId) || !this.isFiniteNumber(multipliedBy)) {
        this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) has invalid components.`);
        return null;
      }

      components.push({ itemId, multipliedBy });
    }

    return components;
  }

  private computeRecipeTotals(
    components: RecipeComponent[],
    basePrices: Record<string, Price>,
    rule: ItemPriceRule,
  ): { low: number; high: number } | null {
    let lowTotal = 0;
    let highTotal = 0;

    for (const component of components) {
      const base = basePrices[String(component.itemId)];
      if (!base || !this.isFiniteNumber(base.low)) {
        this.logger.warn(
          `Price rule ${rule.itemId} (${rule.ruleType}) skipped: missing base price for component ${component.itemId}.`,
        );
        return null;
      }

      const lowPrice = base.low;
      const highPrice = this.isFiniteNumber(base.high) ? base.high : base.low;

      lowTotal += lowPrice * component.multipliedBy;
      highTotal += highPrice * component.multipliedBy;
    }

    if (!Number.isFinite(lowTotal) || !Number.isFinite(highTotal)) {
      this.logger.warn(`Price rule ${rule.itemId} (${rule.ruleType}) produced invalid totals.`);
      return null;
    }

    return { low: lowTotal, high: highTotal };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
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
