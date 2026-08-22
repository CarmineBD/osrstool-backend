import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { IconResolverService } from './icon-resolver.service';
import { IconSearchFilterType, IconSearchType, IconSource } from './icon-source.enum';
import { GameIcon } from './entities/game-icon.entity';

export interface IconSearchResponse {
  id: number;
  name: string;
  type: IconSearchType;
  iconPath: string;
  iconUrl: string;
  iconSource: IconSource;
  lastSyncedAt: string;
  createdAt: string;
}

@Injectable()
export class IconsService {
  constructor(
    @InjectRepository(GameIcon) private readonly gameIconRepo: Repository<GameIcon>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    private readonly iconResolver: IconResolverService,
  ) {}

  async search(
    query: string,
    type?: IconSearchFilterType,
    showUntradeables = false,
  ): Promise<IconSearchResponse[]> {
    const searchPattern = `%${query}%`;
    const [items, gameIcons] = await Promise.all([
      type === undefined || type === 'item'
        ? this.itemRepo.find({
            where: {
              name: ILike(searchPattern),
              ...(showUntradeables ? {} : { tradeable: true }),
            },
            order: { name: 'ASC', id: 'ASC' },
          })
        : Promise.resolve([]),
      type === undefined || type !== 'item'
        ? this.gameIconRepo.find({
            where:
              type === undefined
                ? { name: ILike(searchPattern) }
                : { name: ILike(searchPattern), type },
            order: { type: 'ASC', name: 'ASC', id: 'ASC' },
          })
        : Promise.resolve([]),
    ]);

    return [
      ...items.map((item) => ({
        id: item.id,
        name: item.name,
        type: 'item' as const,
        iconPath: item.iconPath,
        iconUrl: this.iconResolver.buildIconUrl(item.iconPath),
        iconSource: IconSource.ITEM,
        lastSyncedAt: item.lastSyncedAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
      })),
      ...gameIcons.map((icon) => ({
        id: Number(icon.id),
        name: icon.name,
        type: icon.type,
        iconPath: icon.iconPath,
        iconUrl: this.iconResolver.buildIconUrl(icon.iconPath),
        iconSource: IconSource.GAME_ICON,
        lastSyncedAt: icon.lastSyncedAt.toISOString(),
        createdAt: icon.createdAt.toISOString(),
      })),
    ].sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id);
  }

  async findByIds(ids: number[]): Promise<IconSearchResponse[]> {
    if (ids.length === 0) return [];

    const icons = await this.gameIconRepo.find({
      where: { id: In([...new Set(ids)]) },
      order: { type: 'ASC', name: 'ASC', id: 'ASC' },
    });

    return icons.map((icon) => ({
      id: Number(icon.id),
      name: icon.name,
      type: icon.type,
      iconPath: icon.iconPath,
      iconUrl: this.iconResolver.buildIconUrl(icon.iconPath),
      iconSource: IconSource.GAME_ICON,
      lastSyncedAt: icon.lastSyncedAt.toISOString(),
      createdAt: icon.createdAt.toISOString(),
    }));
  }
}
