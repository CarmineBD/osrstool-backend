import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { GameIcon } from './entities/game-icon.entity';
import { IconResolverService } from './icon-resolver.service';
import { IconSource } from './icon-source.enum';

describe('IconResolverService', () => {
  const itemFindBy = jest.fn();
  const gameIconFindBy = jest.fn();
  const configGet = jest.fn();
  const itemRepo = { findBy: itemFindBy } as unknown as Repository<Item>;
  const gameIconRepo = { findBy: gameIconFindBy } as unknown as Repository<GameIcon>;
  const config = { get: configGet } as unknown as ConfigService;
  const service = new IconResolverService(itemRepo, gameIconRepo, config);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('validates item and game-icon ids against their corresponding source', async () => {
    itemFindBy.mockResolvedValue([{ id: 4151 } as Item]);
    gameIconFindBy.mockResolvedValue([{ id: 7 } as GameIcon]);

    await expect(
      service.assertReferencesExist([
        { iconId: 4151, iconSource: IconSource.ITEM },
        { iconId: 7, iconSource: IconSource.GAME_ICON },
      ]),
    ).resolves.toBeUndefined();

    expect(itemFindBy).toHaveBeenCalledTimes(1);
    expect(gameIconFindBy).toHaveBeenCalledTimes(1);
  });

  it('reports the selected source when a referenced icon does not exist', async () => {
    gameIconFindBy.mockResolvedValue([]);

    await expect(
      service.assertReferencesExist([{ iconId: 999, iconSource: IconSource.GAME_ICON }]),
    ).rejects.toEqual(
      new BadRequestException(
        'icon_id must reference an existing game icon when iconSource is "game_icon". Missing ids: 999',
      ),
    );
  });

  it('builds an encoded URL from an icon path', () => {
    configGet.mockReturnValue('https://cdn.example/icons/');

    expect(service.buildIconUrl("Magic icon (p)'s.png")).toBe(
      'https://cdn.example/icons/Magic_icon_%28p%29%27s.png',
    );
  });
});
