import type { Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { GameIcon } from './entities/game-icon.entity';
import { IconResolverService } from './icon-resolver.service';
import { IconSource } from './icon-source.enum';
import { IconsService } from './icons.service';

describe('IconsService', () => {
  it('returns public game-icon catalog entries with their source and URL', async () => {
    const gameIconRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'Magic spellbook',
          type: 'interface',
          iconPath: 'Magic spellbook.png',
          lastSyncedAt: new Date('2026-03-10T22:44:52.263Z'),
          createdAt: new Date('2026-03-10T22:44:52.263Z'),
        } as GameIcon,
      ]),
    } as unknown as Repository<GameIcon>;
    const itemRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Item>;
    const iconResolver = {
      buildIconUrl: jest.fn().mockReturnValue('https://cdn.example/Magic_spellbook.png'),
    } as unknown as IconResolverService;
    const service = new IconsService(gameIconRepo, itemRepo, iconResolver);

    await expect(service.search('magic')).resolves.toEqual([
      {
        id: 1,
        name: 'Magic spellbook',
        type: 'interface',
        iconPath: 'Magic spellbook.png',
        iconUrl: 'https://cdn.example/Magic_spellbook.png',
        iconSource: IconSource.GAME_ICON,
        lastSyncedAt: '2026-03-10T22:44:52.263Z',
        createdAt: '2026-03-10T22:44:52.263Z',
      },
    ]);
  });

  it('searches only items when type is item', async () => {
    const gameIconFind = jest.fn();
    const gameIconRepo = { find: gameIconFind } as unknown as Repository<GameIcon>;
    const itemRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 4151,
          name: 'Abyssal whip',
          iconPath: 'Abyssal_whip.png',
          lastSyncedAt: new Date('2026-03-10T22:44:52.263Z'),
          createdAt: new Date('2026-03-10T22:44:52.263Z'),
        } as Item,
      ]),
    } as unknown as Repository<Item>;
    const iconResolver = {
      buildIconUrl: jest.fn().mockReturnValue('https://cdn.example/Abyssal_whip.png'),
    } as unknown as IconResolverService;
    const service = new IconsService(gameIconRepo, itemRepo, iconResolver);

    await expect(service.search('whip', 'item')).resolves.toEqual([
      {
        id: 4151,
        name: 'Abyssal whip',
        type: 'item',
        iconPath: 'Abyssal_whip.png',
        iconUrl: 'https://cdn.example/Abyssal_whip.png',
        iconSource: IconSource.ITEM,
        lastSyncedAt: '2026-03-10T22:44:52.263Z',
        createdAt: '2026-03-10T22:44:52.263Z',
      },
    ]);
    expect(gameIconFind).not.toHaveBeenCalled();
  });

  it('excludes untradeable items by default and includes them when requested', async () => {
    const gameIconRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<GameIcon>;
    const searchOptions: Array<{ where: Record<string, unknown> }> = [];
    const itemRepo = {
      find: jest.fn((options: { where: Record<string, unknown> }) => {
        searchOptions.push(options);
        return Promise.resolve([]);
      }),
    } as unknown as Repository<Item>;
    const iconResolver = { buildIconUrl: jest.fn() } as unknown as IconResolverService;
    const service = new IconsService(gameIconRepo, itemRepo, iconResolver);

    await service.search('whip', 'item');
    expect(searchOptions[0].where.tradeable).toBe(true);

    await service.search('whip', 'item', true);
    expect(searchOptions[1].where).not.toHaveProperty('tradeable');
  });

  it('resolves stored game icons by ids', async () => {
    const gameIconRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 7,
          name: 'Wind Strike',
          type: 'spell',
          iconPath: 'Wind_Strike.png',
          lastSyncedAt: new Date('2026-03-10T22:44:52.263Z'),
          createdAt: new Date('2026-03-10T22:44:52.263Z'),
        } as GameIcon,
      ]),
    } as unknown as Repository<GameIcon>;
    const itemRepo = {} as Repository<Item>;
    const iconResolver = {
      buildIconUrl: jest.fn().mockReturnValue('https://cdn.example/Wind_Strike.png'),
    } as unknown as IconResolverService;
    const service = new IconsService(gameIconRepo, itemRepo, iconResolver);

    await expect(service.findByIds([7, 7])).resolves.toEqual([
      {
        id: 7,
        name: 'Wind Strike',
        type: 'spell',
        iconPath: 'Wind_Strike.png',
        iconUrl: 'https://cdn.example/Wind_Strike.png',
        iconSource: IconSource.GAME_ICON,
        lastSyncedAt: '2026-03-10T22:44:52.263Z',
        createdAt: '2026-03-10T22:44:52.263Z',
      },
    ]);
  });
});
