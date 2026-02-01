import { ItemsService } from './items.service';
import { Repository } from 'typeorm';
import { PricesService } from '../prices/prices.service';
import { Item } from './entities/item.entity';
import { buildItemFixture } from '../testing/fixtures';

describe('ItemsService', () => {
  const pricesService: { getMany: jest.MockedFunction<PricesService['getMany']> } = {
    getMany: jest.fn(),
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
  );

  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(result[item.id].highPrice).toBe(500);
    expect(result[item.id].lowPrice).toBe(450);
    expect(result[item.id].iconUrl).toBeUndefined();
  });
});
