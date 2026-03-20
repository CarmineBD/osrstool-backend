import { ItemsService } from './items.service';
import { Repository } from 'typeorm';
import { PricesService } from '../prices/prices.service';
import { ItemVolumesService } from '../item-volumes/item-volumes.service';
import { Item } from './entities/item.entity';
import { buildItemFixture } from '../testing/fixtures';
import { ConfigService } from '@nestjs/config';

describe('ItemsService', () => {
  const pricesService: { getMany: jest.MockedFunction<PricesService['getMany']> } = {
    getMany: jest.fn(),
  };
  const itemVolumesService: {
    getMany: jest.MockedFunction<ItemVolumesService['getMany']>;
  } = {
    getMany: jest.fn(),
  };
  const configService: { get: jest.MockedFunction<ConfigService['get']> } = {
    get: jest.fn(),
  };

  type Repo = Pick<
    Repository<Item>,
    | 'findOne'
    | 'findBy'
    | 'createQueryBuilder'
    | 'exist'
    | 'create'
    | 'save'
    | 'preload'
    | 'delete'
    | 'upsert'
  >;

  const repo: jest.Mocked<Repo> = {
    findOne: jest.fn(),
    findBy: jest.fn(),
    createQueryBuilder: jest.fn(),
    exist: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    preload: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  };

  const service = new ItemsService(
    repo as unknown as Repository<Item>,
    pricesService as unknown as PricesService,
    itemVolumesService as unknown as ItemVolumesService,
    configService as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockReturnValue(undefined);
  });

  it('encodes icon URL when returning a single item', async () => {
    const item = buildItemFixture({ iconPath: "Abyssal whip (p)'s.png" });
    repo.findOne.mockResolvedValue(item);

    const result = await service.findOne(item.id);

    expect(result.iconUrl).toBe(
      'https://oldschool.runescape.wiki/images/Abyssal_whip_%28p%29%27s.png',
    );
  });

  it('fetches prices only when price fields are requested', async () => {
    const item = buildItemFixture({ id: 123, iconPath: 'Test item.png' });
    repo.findBy.mockResolvedValue([item]);
    pricesService.getMany.mockResolvedValue({
      [item.id]: { high: 500, low: 450, highTime: 10, lowTime: 20 },
    });

    const result = await service.findByIds([item.id], ['id', 'name', 'highPrice', 'lowPrice']);

    expect(pricesService.getMany).toHaveBeenCalledWith([item.id]);
    expect(itemVolumesService.getMany).not.toHaveBeenCalled();
    expect(result[item.id].highPrice).toBe(500);
    expect(result[item.id].lowPrice).toBe(450);
    expect(result[item.id].iconUrl).toBeUndefined();
  });

  it('fetches 24h volumes and computes item market impact when requested', async () => {
    const item = buildItemFixture({ id: 321, iconPath: 'Some item.png' });
    repo.findBy.mockResolvedValue([item]);
    itemVolumesService.getMany.mockResolvedValue({
      [item.id]: {
        high24h: 240,
        low24h: 120,
        total24h: 360,
        updatedAt: 1735689600,
      },
    });

    const result = await service.findByIds(
      [item.id],
      ['id', 'high24h', 'low24h', 'marketImpactInstant', 'marketImpactSlow'],
    );

    expect(itemVolumesService.getMany).toHaveBeenCalledWith([item.id]);
    expect(result[item.id].high24h).toBe(240);
    expect(result[item.id].low24h).toBe(120);
    expect(result[item.id].marketImpactInstant).toBeCloseTo(0.1, 6);
    expect(result[item.id].marketImpactSlow).toBeCloseTo(0.2, 6);
  });

  it('search excludes untradeable items by default', async () => {
    const item = buildItemFixture({
      id: 123,
      name: 'Rune Search A',
      iconPath: 'Rune Search A.png',
    });
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([item]),
    };
    repo.createQueryBuilder.mockReturnValue(qb as never);

    const result = await service.search('Rune Search', 1, 20);

    expect(qb.where).toHaveBeenCalledWith('item.name ILIKE :q', { q: '%Rune Search%' });
    expect(qb.andWhere).toHaveBeenCalledWith('item.tradeable = true');
    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual({
      id: item.id,
      name: item.name,
      iconUrl: 'https://oldschool.runescape.wiki/images/Rune_Search_A.png',
    });
  });

  it('search includes untradeable items when requested', async () => {
    const item = buildItemFixture({
      id: 124,
      name: 'Rune Search Hidden',
      iconPath: 'Rune Search Hidden.png',
      tradeable: false,
    });
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([item]),
    };
    repo.createQueryBuilder.mockReturnValue(qb as never);

    const result = await service.search('Rune Search', 1, 20, true);

    expect(qb.andWhere).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe('Rune Search Hidden');
  });
});
