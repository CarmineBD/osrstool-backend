import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Item } from './entities/item.entity';

interface MappingItem {
  examine: string;
  id: number;
  members: boolean;
  lowalch: number;
  limit: number;
  value: number;
  highalch: number;
  icon: string;
  name: string;
}

@Injectable()
export class ItemsSeederService {
  private readonly logger = new Logger(ItemsSeederService.name);

  constructor(
    private readonly http: HttpService,
    @InjectRepository(Item) private readonly repo: Repository<Item>,
  ) {}

  async fetchAndFillItemsInfo(): Promise<void> {
    const url = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
    this.logger.log('Fetching items mapping from RuneScape API');
    const { data } = await firstValueFrom(this.http.get<MappingItem[]>(url));

    if (!Array.isArray(data)) {
      this.logger.error('Unexpected response format when fetching items mapping');
      return;
    }

    const ids = data.map((i) => i.id);
    const existing = await this.repo.findBy({ id: In(ids) });
    const existingIds = new Set(existing.map((i) => i.id));

    const newEntities = data
      .filter((i) => !existingIds.has(i.id))
      .map((i) =>
        this.repo.create({
          id: i.id,
          name: i.name,
          iconPath: i.icon,
          examine: i.examine,
          value: i.value,
          highAlch: i.highalch ?? null,
          lowAlch: i.lowalch ?? null,
          buyLimit: i.limit ?? null,
          members: i.members ?? false,
          tradeable: true,
        }),
      );

    if (newEntities.length === 0) {
      this.logger.log('No new items to insert');
      return;
    }

    await this.repo.insert(newEntities);
    this.logger.log(`Inserted ${newEntities.length} new items`);
  }
}
