import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { GameIcon } from './entities/game-icon.entity';
import { IconSource } from './icon-source.enum';

export interface IconReference {
  iconId: number;
  iconSource: IconSource;
}

@Injectable()
export class IconResolverService {
  private cdnBase?: string;

  constructor(
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(GameIcon) private readonly gameIconRepo: Repository<GameIcon>,
    private readonly config: ConfigService,
  ) {}

  buildIconUrl(iconPath: string): string {
    if (!this.cdnBase) {
      this.cdnBase = (
        this.config.get<string>('CDN_BASE') ?? 'https://oldschool.runescape.wiki/images/'
      ).replace(/\/+$/, '');
    }

    const path = iconPath
      .replace(/^\/+/, '')
      .replace(/ /g, '_')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/'/g, '%27');

    return `${this.cdnBase}/${path}`;
  }

  async assertReferencesExist(references: IconReference[]): Promise<void> {
    const invalid = references.find(
      (reference) =>
        !Number.isSafeInteger(reference.iconId) ||
        reference.iconId <= 0 ||
        !Object.values(IconSource).includes(reference.iconSource),
    );
    if (invalid) {
      throw new BadRequestException(
        'Each icon requires a positive integer icon_id and an iconSource of "item" or "game_icon"',
      );
    }

    const itemIds = [
      ...new Set(
        references
          .filter((reference) => reference.iconSource === IconSource.ITEM)
          .map((reference) => reference.iconId),
      ),
    ];
    const gameIconIds = [
      ...new Set(
        references
          .filter((reference) => reference.iconSource === IconSource.GAME_ICON)
          .map((reference) => reference.iconId),
      ),
    ];

    const [items, gameIcons] = await Promise.all([
      itemIds.length > 0 ? this.itemRepo.findBy({ id: In(itemIds) }) : Promise.resolve([]),
      gameIconIds.length > 0
        ? this.gameIconRepo.findBy({ id: In(gameIconIds) })
        : Promise.resolve([]),
    ]);

    this.assertIdsExist(
      itemIds,
      items.map((item) => item.id),
      IconSource.ITEM,
    );
    this.assertIdsExist(
      gameIconIds,
      gameIcons.map((icon) => icon.id),
      IconSource.GAME_ICON,
    );
  }

  private assertIdsExist(ids: number[], foundRecordIds: number[], source: IconSource): void {
    if (ids.length === 0) return;

    const foundIds = new Set(foundRecordIds.map(Number));
    const missingIds = ids.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      const target = source === IconSource.ITEM ? 'item' : 'game icon';
      throw new BadRequestException(
        `icon_id must reference an existing ${target} when iconSource is "${source}". Missing ids: ${missingIds.join(', ')}`,
      );
    }
  }
}
