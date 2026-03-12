import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Item } from './entities/item.entity';
import {
  CreateItemDto,
  UpdateItemDto,
  ItemUpsertDto,
  ItemResponseDto,
  ItemCompactDto,
} from './dto';
import { PricesService } from '../prices/prices.service';
import { ItemVolumesService } from '../item-volumes/item-volumes.service';
import { calculateMarketImpact } from '../methods/market-impact-calculator';

interface ItemVolume24h {
  high24h?: number;
  low24h?: number;
}

interface ItemPriceData {
  high: number;
  low: number;
  highTime: number;
  lowTime: number;
}
@Injectable()
export class ItemsService {
  private cdnBase?: string;

  constructor(
    @InjectRepository(Item) private readonly repo: Repository<Item>,
    private readonly pricesService: PricesService,
    private readonly itemVolumesService: ItemVolumesService,
    private readonly config: ConfigService,
  ) {}

  private buildIconUrl(iconPath: string): string {
    if (!this.cdnBase) {
      const base = (
        this.config.get<string>('CDN_BASE') ?? 'https://oldschool.runescape.wiki/images/'
      ).replace(/\/+$/, '');
      this.cdnBase = base;
    }
    const base = this.cdnBase;

    // Limpieza del path y formateo personalizado
    const path = iconPath
      .replace(/^\/+/, '') // quitar slashes iniciales
      .replace(/ /g, '_') // espacios -> "_"
      .replace(/\(/g, '%28') // "(" -> "%28"
      .replace(/\)/g, '%29') // ")" -> "%29"
      .replace(/'/g, '%27'); // "'" -> "%27"

    return `${base}/${path}`;
  }

  private toResponse(item: Item): ItemResponseDto {
    return {
      id: item.id,
      name: item.name,
      iconUrl: this.buildIconUrl(item.iconPath),
      examine: item.examine,
      value: item.value,
      highAlch: item.highAlch,
      lowAlch: item.lowAlch,
      buyLimit: item.buyLimit,
      questItem: item.questItem,
      equipable: item.equipable,
      noteable: item.noteable,
      stackable: item.stackable,
      weight: item.weight,
      tradeable: item.tradeable,
      members: item.members,
      lastSyncedAt: item.lastSyncedAt.toISOString(),
    };
  }

  private filterFields(item: ItemResponseDto, fields?: string[]): Partial<ItemResponseDto> {
    if (!fields || fields.length === 0) return item;
    const result: Partial<ItemResponseDto> = {};
    const resAny = result as Record<string, unknown>;
    const itemAny = item as unknown as Record<string, unknown>;
    for (const f of fields) {
      if (f in itemAny) {
        resAny[f] = itemAny[f];
      }
    }
    return result;
  }

  private toNonNegativeNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value >= 0 ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed >= 0 ? parsed : 0;
      }
    }

    return null;
  }

  private normalizeItemPrices(raw: unknown): Record<number, ItemPriceData> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const result: Record<number, ItemPriceData> = {};
    for (const [itemIdRaw, value] of Object.entries(raw as Record<string, unknown>)) {
      const itemId = Number.parseInt(itemIdRaw, 10);
      if (!Number.isInteger(itemId) || itemId <= 0) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

      const candidate = value as Record<string, unknown>;
      const low = this.toNonNegativeNumberOrNull(candidate.low);
      if (low === null) continue;
      const high = this.toNonNegativeNumberOrNull(candidate.high) ?? low;
      const highTime = this.toNonNegativeNumberOrNull(candidate.highTime) ?? 0;
      const lowTime = this.toNonNegativeNumberOrNull(candidate.lowTime) ?? 0;

      result[itemId] = { high, low, highTime, lowTime };
    }

    return result;
  }

  private normalizeItemVolumes24h(raw: unknown): Record<number, ItemVolume24h> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const result: Record<number, ItemVolume24h> = {};
    for (const [itemIdRaw, value] of Object.entries(raw as Record<string, unknown>)) {
      const itemId = Number.parseInt(itemIdRaw, 10);
      if (!Number.isInteger(itemId) || itemId <= 0) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

      const candidate = value as Record<string, unknown>;
      const high24h = this.toNonNegativeNumberOrNull(candidate.high24h);
      const low24h = this.toNonNegativeNumberOrNull(candidate.low24h);
      if (high24h === null && low24h === null) continue;

      result[itemId] = {
        ...(high24h !== null ? { high24h } : {}),
        ...(low24h !== null ? { low24h } : {}),
      };
    }

    return result;
  }

  private calculateItemMarketImpact(
    itemId: number,
    volumes24hByItem: Record<number, ItemVolume24h>,
  ): { marketImpactInstant: number; marketImpactSlow: number } {
    // Per-item impact uses a single-unit quantity and removes cross-item weighting.
    return calculateMarketImpact({
      inputs: [{ id: itemId, quantity: 1 }],
      outputs: [],
      pricesByItem: {},
      volumes24hByItem,
      alpha: 1,
    });
  }

  async findOne(id: number): Promise<ItemResponseDto> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    return this.toResponse(item);
  }

  async findByIds(
    ids: number[],
    fields?: string[],
  ): Promise<Record<number, Partial<ItemResponseDto>>> {
    if (ids.length === 0) return {};
    const items = await this.repo.findBy({ id: In(ids) });
    const priceFieldSet = new Set(['highPrice', 'lowPrice', 'highTime', 'lowTime']);
    const volumeFieldSet = new Set(['high24h', 'low24h']);
    const marketImpactFieldSet = new Set(['marketImpactInstant', 'marketImpactSlow']);
    const wantPrices = fields?.some((f) => priceFieldSet.has(f)) ?? false;
    const wantVolumes =
      fields?.some((f) => volumeFieldSet.has(f) || marketImpactFieldSet.has(f)) ?? false;
    const wantMarketImpact = fields?.some((f) => marketImpactFieldSet.has(f)) ?? false;
    const itemIds = items.map((i) => i.id);

    const [rawPrices, rawVolumes24hByItem] = await Promise.all([
      wantPrices ? this.pricesService.getMany(itemIds) : Promise.resolve({}),
      wantVolumes ? this.itemVolumesService.getMany(itemIds) : Promise.resolve({}),
    ]);

    const prices = this.normalizeItemPrices(rawPrices);
    const volumes24hByItem = this.normalizeItemVolumes24h(rawVolumes24hByItem);

    const map: Record<number, Partial<ItemResponseDto>> = {};
    for (const item of items) {
      const base = this.toResponse(item);
      if (wantPrices) {
        const p = prices[item.id];
        if (p) {
          base.highPrice = p.high;
          base.lowPrice = p.low;
          base.highTime = p.highTime;
          base.lowTime = p.lowTime;
        }
      }
      if (wantVolumes) {
        const volume = volumes24hByItem[item.id];
        base.high24h = volume?.high24h ?? null;
        base.low24h = volume?.low24h ?? null;
      }
      if (wantMarketImpact) {
        const impact = this.calculateItemMarketImpact(item.id, volumes24hByItem);
        base.marketImpactInstant = impact.marketImpactInstant;
        base.marketImpactSlow = impact.marketImpactSlow;
      }
      map[item.id] = this.filterFields(base, fields);
    }
    return map;
  }

  async list(
    page: number,
    pageSize: number,
    sort: string,
    order: 'asc' | 'desc',
    members?: boolean,
    tradeable?: boolean,
  ): Promise<{ data: ItemResponseDto[]; page: number; pageSize: number; total: number }> {
    const qb = this.repo.createQueryBuilder('item');
    if (members !== undefined) {
      qb.andWhere('item.members = :members', { members });
    }
    if (tradeable !== undefined) {
      qb.andWhere('item.tradeable = :tradeable', { tradeable });
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy(`item.${sort}`, order.toUpperCase() as 'ASC' | 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return {
      data: items.map((i) => this.toResponse(i)),
      page,
      pageSize,
      total,
    };
  }

  async search(
    q: string,
    page: number,
    pageSize: number,
    showUntradeables = false,
  ): Promise<{ data: ItemCompactDto[]; page: number; pageSize: number; total: number }> {
    if (q.length === 0) throw new BadRequestException('q is required');
    const qb = this.repo
      .createQueryBuilder('item')
      .where('item.name ILIKE :q', { q: `%${q}%` })
      .orderBy('item.name', 'ASC');
    if (!showUntradeables) {
      qb.andWhere('item.tradeable = true');
    }
    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    return {
      data: items.map((i) => ({
        id: i.id,
        name: i.name,
        iconUrl: this.buildIconUrl(i.iconPath),
      })),
      page,
      pageSize,
      total,
    };
  }

  async create(dto: CreateItemDto): Promise<ItemResponseDto> {
    const exists = await this.repo.exist({ where: { id: dto.id } });
    if (exists) throw new ConflictException('Item id already exists');
    const item = this.repo.create(dto);
    const saved = await this.repo.save(item);
    return this.toResponse(saved);
  }

  async update(id: number, dto: UpdateItemDto): Promise<ItemResponseDto> {
    const item = await this.repo.preload({ id, ...dto });
    if (!item) throw new NotFoundException('Item not found');
    const saved = await this.repo.save(item);
    return this.toResponse(saved);
  }

  async remove(id: number): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Item not found');
  }

  async bulkUpsert(
    items: ItemUpsertDto[],
    touchLastSyncedAt = true,
  ): Promise<{ created: number; updated: number }> {
    if (items.length === 0) return { created: 0, updated: 0 };
    const ids = items.map((i) => i.id);
    const existing = await this.repo.findBy({ id: In(ids) });
    const existingIds = new Set(existing.map((i) => i.id));
    const now = new Date();
    const entities = items.map((dto) =>
      this.repo.create({
        ...dto,
        ...(touchLastSyncedAt !== false ? { lastSyncedAt: now } : {}),
      }),
    );
    await this.repo.upsert(entities, ['id']);
    return { created: ids.length - existingIds.size, updated: existingIds.size };
  }
}
