import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import {
  CreateItemDto,
  UpdateItemDto,
  ItemUpsertDto,
  ItemResponseDto,
  ItemCompactDto,
} from './dto';
import { PricesService } from '../prices/prices.service';
@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private readonly repo: Repository<Item>,
    private readonly pricesService: PricesService,
  ) {}

  private buildIconUrl(iconPath: string): string {
    const base = (process.env.CDN_BASE ?? 'https://oldschool.runescape.wiki/images/').replace(
      /\/+$/,
      '',
    );

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
    const wantPrices = fields?.some((f) => priceFieldSet.has(f)) ?? false;
    const prices = wantPrices ? await this.pricesService.getMany(items.map((i) => i.id)) : {};

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

  async search(q: string, limit: number): Promise<ItemCompactDto[]> {
    if (q.length === 0) throw new BadRequestException('q is required');
    const items = await this.repo
      .createQueryBuilder('item')
      .where('item.name ILIKE :q', { q: `%${q}%` })
      .orderBy('item.name', 'ASC')
      .take(limit)
      .getMany();
    return items.map((i) => ({
      id: i.id,
      name: i.name,
      iconUrl: this.buildIconUrl(i.iconPath),
    }));
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
