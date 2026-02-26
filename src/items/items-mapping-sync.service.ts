import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { In, Repository } from 'typeorm';
import { Item } from './entities/item.entity';

const MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_USER_AGENT = 'osrstool-backend items-sync (contact: set OSRS_WIKI_USER_AGENT)';

interface MappingApiItem {
  id: number;
  name: string;
  examine: string | null;
  members: boolean;
  lowalch: number | null;
  highalch: number | null;
  limit: number | null;
  value: number | null;
  icon: string;
}

interface ComparableItem {
  id: number;
  name: string;
  examine: string | null;
  members: boolean;
  lowAlch: number | null;
  highAlch: number | null;
  buyLimit: number | null;
  value: number | null;
  iconPath: string;
}

type ExistingComparableItem = Pick<
  Item,
  'id' | 'name' | 'examine' | 'members' | 'lowAlch' | 'highAlch' | 'buyLimit' | 'value' | 'iconPath'
>;

export interface ItemsMappingSyncOptions {
  dryRun?: boolean;
  chunkSize?: number;
}

export interface ItemsMappingSyncResult {
  inserted: number;
  updated: number;
}

@Injectable()
export class ItemsMappingSyncService {
  constructor(
    private readonly http: HttpService,
    @InjectRepository(Item) private readonly repo: Repository<Item>,
    private readonly config: ConfigService,
  ) {}

  async syncFromMapping(opts: ItemsMappingSyncOptions = {}): Promise<ItemsMappingSyncResult> {
    const dryRun = opts.dryRun === true;
    const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;

    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new Error('chunkSize must be a positive integer.');
    }

    const mappingItems = await this.fetchMappingItems();
    if (mappingItems.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    const mappingById = new Map<number, ComparableItem>();
    for (const mappingItem of mappingItems) {
      mappingById.set(mappingItem.id, this.toComparableItem(mappingItem));
    }

    const ids = [...mappingById.keys()];
    const existingItems = await this.repo.find({
      where: { id: In(ids) },
      select: {
        id: true,
        name: true,
        examine: true,
        members: true,
        lowAlch: true,
        highAlch: true,
        buyLimit: true,
        value: true,
        iconPath: true,
      },
    });

    const existingById = new Map<number, ExistingComparableItem>(
      existingItems.map((item) => [item.id, item]),
    );

    const missing: ComparableItem[] = [];
    const changed: ComparableItem[] = [];

    for (const [id, incoming] of mappingById.entries()) {
      const existing = existingById.get(id);
      if (!existing) {
        missing.push(incoming);
        continue;
      }

      if (this.hasChanges(existing, incoming)) {
        changed.push(incoming);
      }
    }

    if (!dryRun) {
      await this.insertMissing(missing, chunkSize);
      await this.updateChanged(changed, chunkSize);
    }

    return { inserted: missing.length, updated: changed.length };
  }

  private async fetchMappingItems(): Promise<MappingApiItem[]> {
    const userAgent = this.config.get<string>('OSRS_WIKI_USER_AGENT')?.trim() || DEFAULT_USER_AGENT;
    const response = await firstValueFrom(
      this.http.get<unknown>(MAPPING_URL, {
        headers: { 'User-Agent': userAgent },
      }),
    );

    if (!Array.isArray(response.data)) {
      throw new Error('Unexpected mapping response format.');
    }

    return response.data as MappingApiItem[];
  }

  private toComparableItem(item: MappingApiItem): ComparableItem {
    return {
      id: item.id,
      name: item.name,
      examine: this.normalizeString(item.examine),
      members: Boolean(item.members),
      lowAlch: this.normalizeNumber(item.lowalch),
      highAlch: this.normalizeNumber(item.highalch),
      buyLimit: this.normalizeNumber(item.limit),
      value: this.normalizeNumber(item.value),
      iconPath: item.icon,
    };
  }

  private normalizeNumber(value: number | null | undefined): number | null {
    return value ?? null;
  }

  private normalizeString(value: string | null | undefined): string | null {
    return value ?? null;
  }

  private hasChanges(existing: ExistingComparableItem, incoming: ComparableItem): boolean {
    return (
      existing.name !== incoming.name ||
      existing.examine !== incoming.examine ||
      existing.members !== incoming.members ||
      existing.lowAlch !== incoming.lowAlch ||
      existing.highAlch !== incoming.highAlch ||
      existing.buyLimit !== incoming.buyLimit ||
      existing.value !== incoming.value ||
      existing.iconPath !== incoming.iconPath
    );
  }

  private async insertMissing(items: ComparableItem[], chunkSize: number): Promise<void> {
    for (const chunk of this.chunk(items, chunkSize)) {
      await this.repo.insert(
        chunk.map((item) => ({
          ...item,
          tradeable: true,
          lastSyncedAt: new Date(),
        })),
      );
    }
  }

  private async updateChanged(items: ComparableItem[], chunkSize: number): Promise<void> {
    for (const chunk of this.chunk(items, chunkSize)) {
      await this.repo.upsert(
        chunk.map((item) => ({
          ...item,
          lastSyncedAt: new Date(),
        })),
        ['id'],
      );
    }
  }

  private chunk<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
  }
}
