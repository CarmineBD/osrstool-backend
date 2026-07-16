import { MethodsService } from './methods.service';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { Repository } from 'typeorm';
import { VariantIoItem } from './entities/io-item.entity';
import { VariantHistory } from './entities/variant-history.entity';
import { MethodLike } from './entities/method-like.entity';
import { VariantSnapshotService } from '../variant-snapshots/variant-snapshot.service';
import { RuneScapeApiService } from './RuneScapeApiService';
import { buildItemFixture, buildMethodFixture } from '../testing/fixtures';
import type { ConfigService } from '@nestjs/config';
import { User } from '../auth/entities/user.entity';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Item } from '../items/entities/item.entity';

type MethodDetailsWithProfitResult = Awaited<
  ReturnType<MethodsService['findMethodDetailsWithProfit']>
>;

const call = jest.fn();
const quit = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ call, quit })),
}));

const createMethodLikeRepo = (
  likeCountRows: Array<{ methodId: string; likesCount: string }> = [],
  likedMethodIds: string[] = [],
): Repository<MethodLike> => {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(likeCountRows),
  };

  return {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    find: jest
      .fn()
      .mockResolvedValue(likedMethodIds.map((methodId) => ({ methodId }) as MethodLike)),
  } as unknown as Repository<MethodLike>;
};

describe('MethodsService variantCount', () => {
  beforeEach(() => {
    call.mockReset();
  });

  it('returns total variant count independent of user info', async () => {
    const methodEntity: Method = {
      id: 'm1',
      name: 'Method 1',
      slug: 'method-1',
      description: undefined,
      category: undefined,
      enabled: true,
      createdAt: new Date(),
      variants: [
        {
          id: 'v1',
          slug: 'v1',
          label: 'Variant 1',
          description: null,
          xpHour: null,
          clickIntensity: 0,
          afkiness: 0,
          riskLevel: '0',
          requirements: { levels: [{ skill: 'Strength', level: 50 }] },
          recommendations: null,
          wilderness: false,
          actionsPerHour: 0,
          createdAt: new Date(),
          ioItems: [],
          method: {} as Method,
        } as MethodVariant,
        {
          id: 'v2',
          slug: 'v2',
          label: 'Variant 2',
          description: null,
          xpHour: null,
          clickIntensity: 0,
          afkiness: 0,
          riskLevel: '0',
          requirements: null,
          recommendations: null,
          wilderness: false,
          actionsPerHour: 0,
          createdAt: new Date(),
          ioItems: [],
          method: {} as Method,
        } as MethodVariant,
      ],
    };

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockResolvedValue(
      JSON.stringify([
        {
          m1: {
            v1: { low: 0, high: 10 },
            v2: { low: 0, high: 20 },
          },
        },
      ]),
    );

    const userInfo = { levels: { Strength: 1 }, quests: {}, achievement_diaries: {} };

    const result = (await service.findAllWithProfit(
      1,
      10,
      userInfo,
      { enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
    )) as {
      data: Array<{ variantCount: number; variants: Array<{ id: string }> }>;
      total: number;
    };

    expect(result.data[0].variantCount).toBe(2);
    expect(result.data[0].variants).toHaveLength(1);
    expect(result.data[0].variants[0].id).toBe('v2');
  });

  it('returns one method row per variant when variants=all', async () => {
    const methodEntity: Method = {
      id: 'm1',
      name: 'Method 1',
      slug: 'method-1',
      description: undefined,
      category: undefined,
      enabled: true,
      createdAt: new Date(),
      variants: [
        {
          id: 'v1',
          slug: 'v1',
          label: 'Variant 1',
          description: null,
          xpHour: null,
          clickIntensity: 0,
          afkiness: 0,
          riskLevel: '0',
          requirements: null,
          recommendations: null,
          wilderness: false,
          actionsPerHour: 0,
          createdAt: new Date(),
          ioItems: [],
          method: {} as Method,
        } as MethodVariant,
        {
          id: 'v2',
          slug: 'v2',
          label: 'Variant 2',
          description: null,
          xpHour: null,
          clickIntensity: 0,
          afkiness: 0,
          riskLevel: '0',
          requirements: null,
          recommendations: null,
          wilderness: false,
          actionsPerHour: 0,
          createdAt: new Date(),
          ioItems: [],
          method: {} as Method,
        } as MethodVariant,
      ],
    };

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockResolvedValue(
      JSON.stringify([
        {
          m1: {
            v1: { low: 0, high: 10 },
            v2: { low: 0, high: 20 },
          },
        },
      ]),
    );

    const result = (await service.findAllWithProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
      {},
      'all',
    )) as {
      data: Array<{ id: string; variantCount: number; variants: Array<{ id: string }> }>;
      total: number;
    };

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'm1',
          variantCount: 2,
          variants: [expect.objectContaining({ id: 'v1' })],
        }),
        expect.objectContaining({
          id: 'm1',
          variantCount: 2,
          variants: [expect.objectContaining({ id: 'v2' })],
        }),
      ]),
    );
  });

  it('includes per-side market impact breakdown on variants', async () => {
    const methodEntity: Method = {
      id: 'm1',
      name: 'Method 1',
      slug: 'method-1',
      description: undefined,
      category: undefined,
      enabled: true,
      createdAt: new Date(),
      variants: [
        {
          id: 'v1',
          slug: 'v1',
          label: 'Variant 1',
          description: null,
          xpHour: null,
          clickIntensity: 0,
          afkiness: 0,
          riskLevel: '0',
          requirements: null,
          recommendations: null,
          wilderness: false,
          actionsPerHour: 0,
          createdAt: new Date(),
          ioItems: [
            {
              id: 1,
              itemId: 100,
              quantity: 50,
              type: 'input',
              reason: null,
              createdAt: new Date(),
              variant: {} as MethodVariant,
            } as VariantIoItem,
            {
              id: 2,
              itemId: 200,
              quantity: 60,
              type: 'output',
              reason: null,
              createdAt: new Date(),
              variant: {} as MethodVariant,
            } as VariantIoItem,
          ],
          method: {} as Method,
        } as MethodVariant,
      ],
    };

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockImplementation((command: string, key: string) => {
      if (command === 'HGETALL' && key === 'methods:profits') {
        return {
          m1: JSON.stringify({
            v1: { low: 100, high: 200 },
          }),
        };
      }

      if (command === 'HMGET' && key === 'items:prices') {
        return [JSON.stringify({ high: 100, low: 90 }), JSON.stringify({ high: 200, low: 180 })];
      }

      if (command === 'HMGET' && key === 'items:vol24h') {
        return [
          JSON.stringify({ high24h: 2400, low24h: 4800 }),
          JSON.stringify({ high24h: 1200, low24h: 2400 }),
        ];
      }

      return null;
    });

    const result = (await service.findAllWithProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
    )) as {
      data: Array<{
        variants: Array<{
          inputMarketImpactInstant: number;
          inputMarketImpactSlow: number;
          outputMarketImpactInstant: number;
          outputMarketImpactSlow: number;
          marketImpactInstant: number;
          marketImpactSlow: number;
        }>;
      }>;
    };

    expect(result.data[0].variants[0]).toMatchObject({
      inputMarketImpactInstant: 0.5,
      inputMarketImpactSlow: 0.25,
      outputMarketImpactInstant: 0.6,
      outputMarketImpactSlow: 1.2,
      marketImpactInstant: 0.55,
      marketImpactSlow: 0.725,
    });
  });

  it('filters non-profitable variants when showProfitables is true', async () => {
    const methodEntity = buildMethodFixture();
    methodEntity.id = 'm1';
    methodEntity.variants[0].id = 'v1';
    methodEntity.variants[1].id = 'v2';

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockResolvedValue(
      JSON.stringify([
        {
          m1: {
            v1: { low: 0, high: 0 },
            v2: { low: -10, high: -5 },
          },
        },
      ]),
    );

    const result = await service.findAllWithProfit(
      1,
      10,
      undefined,
      { showProfitables: true, enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
    );

    expect(result.data).toHaveLength(0);
  });

  it('filters variants by afkiness using strictly greater-than semantics', async () => {
    const methodEntity = buildMethodFixture();
    methodEntity.id = 'm1';
    methodEntity.variants[0].id = 'v1';
    methodEntity.variants[1].id = 'v2';

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockResolvedValue(
      JSON.stringify([
        {
          m1: {
            v1: { low: 0, high: 100 },
            v2: { low: 0, high: 80 },
          },
        },
      ]),
    );

    const result = await service.findAllWithProfit(
      1,
      10,
      undefined,
      { afkiness: 3, enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
    );

    expect(result.data).toHaveLength(1);
    const method = result.data[0] as { variants: Array<{ id: string }> };
    expect(method.variants).toHaveLength(1);
    expect(method.variants[0].id).toBe('v2');
  });

  it('filters variants by members flag', async () => {
    const methodEntity = buildMethodFixture();
    methodEntity.id = 'm1';
    methodEntity.variants[0].id = 'v1';
    methodEntity.variants[0].members = false;
    methodEntity.variants[1].id = 'v2';
    methodEntity.variants[1].members = true;

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockResolvedValue(
      JSON.stringify([
        {
          m1: {
            v1: { low: 0, high: 100 },
            v2: { low: 0, high: 200 },
          },
        },
      ]),
    );

    const result = await service.findAllWithProfit(
      1,
      10,
      undefined,
      { members: false, enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
      {},
      'all',
    );

    expect(result.data).toHaveLength(1);
    const method = result.data[0] as { variants: Array<{ id: string; members: boolean }> };
    expect(method.variants[0]).toMatchObject({ id: 'v1', members: false });
  });

  it('adds gpPerXpHigh and gpPerXpLow when skill is provided using that skill xp only', async () => {
    const methodEntity = buildMethodFixture();
    methodEntity.id = 'm1';
    methodEntity.variants[0].id = 'v1';
    methodEntity.variants[1].id = 'v2';
    methodEntity.variants[0].xpHour = [
      { skill: 'Crafting', experience: 7000 },
      { skill: 'Magic', experience: 5000 },
    ];
    methodEntity.variants[1].xpHour = [{ skill: 'Magic', experience: 2000 }];

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'getAllMethodsProfits').mockResolvedValue({
      m1: {
        v1: { low: 5000, high: 10000 },
        v2: { low: 4000, high: 8000 },
      },
    });
    jest.spyOn(service as any, 'getItemPrices').mockResolvedValue({});
    jest.spyOn(service as any, 'getItemVolumes24h').mockResolvedValue({});

    const result = (await service.findAllWithProfit(
      1,
      10,
      undefined,
      { skill: 'magic', enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
      {},
      'all',
    )) as {
      data: Array<{ variants: Array<{ id: string; gpPerXpHigh?: number; gpPerXpLow?: number }> }>;
    };

    expect(result.data).toHaveLength(2);

    const variantById = new Map(result.data.map((m) => [m.variants[0].id, m.variants[0]]));
    expect(variantById.get('v1')).toMatchObject({
      gpPerXpHigh: 2,
      gpPerXpLow: 1,
    });
    expect(variantById.get('v2')).toMatchObject({
      gpPerXpHigh: 4,
      gpPerXpLow: 2,
    });
  });

  it('does not add gpPerXp fields when skill is not provided', async () => {
    const methodEntity = buildMethodFixture();
    methodEntity.id = 'm1';
    methodEntity.variants[0].id = 'v1';

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'getAllMethodsProfits').mockResolvedValue({
      m1: {
        [methodEntity.variants[0].id]: { low: 100, high: 200 },
        [methodEntity.variants[1].id]: { low: 50, high: 150 },
      },
    });
    jest.spyOn(service as any, 'getItemPrices').mockResolvedValue({});
    jest.spyOn(service as any, 'getItemVolumes24h').mockResolvedValue({});

    const result = (await service.findAllWithProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
      {},
      'all',
    )) as {
      data: Array<{ variants: Array<{ gpPerXpHigh?: number; gpPerXpLow?: number }> }>;
    };

    const variant = result.data[0].variants[0];
    expect(variant.gpPerXpHigh).toBeUndefined();
    expect(variant.gpPerXpLow).toBeUndefined();
  });

  it('builds skill summaries using only variants that grant xp to that skill', async () => {
    const methodOne: Method = {
      id: 'm1',
      name: 'Magic method',
      slug: 'magic-method',
      description: undefined,
      category: 'Skilling',
      enabled: true,
      createdAt: new Date(),
      variants: [
        {
          id: 'v1',
          slug: 'v1',
          label: 'Magic xp variant',
          description: null,
          xpHour: [
            { skill: 'Magic', experience: 100000 },
            { skill: 'Crafting', experience: 200000 },
          ],
          clickIntensity: 5,
          afkiness: 10,
          riskLevel: '1',
          requirements: null,
          recommendations: null,
          wilderness: false,
          actionsPerHour: 800,
          createdAt: new Date(),
          ioItems: [],
          method: {} as Method,
        } as MethodVariant,
        {
          id: 'v2',
          slug: 'v2',
          label: 'Magic profit variant',
          description: null,
          xpHour: [{ skill: 'Magic', experience: 50000 }],
          clickIntensity: 4,
          afkiness: 20,
          riskLevel: '1',
          requirements: null,
          recommendations: null,
          wilderness: false,
          actionsPerHour: 600,
          createdAt: new Date(),
          ioItems: [],
          method: {} as Method,
        } as MethodVariant,
      ],
    };

    const methodTwo: Method = {
      id: 'm2',
      name: 'Crafting method',
      slug: 'crafting-method',
      description: undefined,
      category: 'Skilling',
      enabled: true,
      createdAt: new Date(),
      variants: [
        {
          id: 'v3',
          slug: 'v3',
          label: 'Crafting afk variant',
          description: null,
          xpHour: [{ skill: 'Crafting', experience: 150000 }],
          clickIntensity: 2,
          afkiness: 30,
          riskLevel: '1',
          requirements: null,
          recommendations: null,
          wilderness: false,
          actionsPerHour: 500,
          createdAt: new Date(),
          ioItems: [],
          method: {} as Method,
        } as MethodVariant,
      ],
    };

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodOne, methodTwo]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockImplementation((command: string) => {
      if (command === 'HGETALL') {
        return {
          m1: JSON.stringify({
            v1: { low: 0, high: 500 },
            v2: { low: 0, high: 800 },
          }),
          m2: JSON.stringify({
            v3: { low: 0, high: 1000 },
          }),
        };
      }
      return null;
    });

    const result = (await service.skillsSummaryWithProfitResponse()) as {
      data: Record<
        string,
        {
          bestProfit: { variants: Array<{ id: string }> };
          bestAfk: { variants: Array<{ id: string }> };
          bestXp: { variants: Array<{ id: string }> };
        }
      >;
      meta: { computedAt: number };
    };

    expect(result.data.magic.bestXp.variants[0].id).toBe('v1');
    expect(result.data.magic.bestProfit.variants[0].id).toBe('v2');
    expect(result.data.magic.bestAfk.variants[0].id).toBe('v2');
    expect(result.data.crafting.bestXp.variants[0].id).toBe('v1');
    expect(result.data.crafting.bestProfit.variants[0].id).toBe('v3');
    expect(result.data.crafting.bestAfk.variants[0].id).toBe('v3');
    expect(Number.isInteger(result.meta.computedAt)).toBe(true);
  });

  it('throws when username is sent by a non-registered user', async () => {
    const methodRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Method>;

    const userRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<User>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      userRepo,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'verifySupabaseToken').mockResolvedValue('user-1');

    await expect(
      service.listWithProfitResponse({
        page: '1',
        perPage: '10',
        username: 'zezima',
        authorization: 'Bearer token',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not require auth when username is not sent', async () => {
    const methodRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Method>;

    const userRepo = {
      findOne: jest.fn(),
    } as unknown as Repository<User>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      userRepo,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    const verifyTokenSpy = jest
      .spyOn(service as any, 'verifySupabaseToken')
      .mockResolvedValue('user-1');

    const result = await service.listWithProfitResponse({
      page: '1',
      perPage: '10',
      authorization: undefined,
    });

    expect(verifyTokenSpy).not.toHaveBeenCalled();
    expect(result.status).toBe('ok');
  });

  it('throws on skill summaries when username is sent by a non-registered user', async () => {
    const methodRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Method>;

    const userRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<User>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      userRepo,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'verifySupabaseToken').mockResolvedValue('user-1');

    await expect(
      service.skillsSummaryWithProfitResponse('zezima', 'Bearer token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('supports enabled=false on skill summaries for super admins', async () => {
    const findMock = jest.fn().mockResolvedValue([]);
    const methodRepo = {
      find: findMock,
    } as unknown as Repository<Method>;

    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', role: 'super_admin' }),
    } as unknown as Repository<User>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      userRepo,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'verifySupabaseToken').mockResolvedValue('user-1');

    await service.skillsSummaryWithProfitResponse(undefined, 'Bearer token', 'false');

    expect(findMock).toHaveBeenCalledWith({
      where: { enabled: false },
      relations: ['variants', 'variants.ioItems'],
    });
  });

  it('throws when enabled query param is sent by a non-super admin on skill summaries', async () => {
    const findMock = jest.fn().mockResolvedValue([]);
    const methodRepo = {
      find: findMock,
    } as unknown as Repository<Method>;

    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', role: 'user' }),
    } as unknown as Repository<User>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      userRepo,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'verifySupabaseToken').mockResolvedValue('user-1');

    await expect(
      service.skillsSummaryWithProfitResponse(undefined, 'Bearer token', 'true'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMock).not.toHaveBeenCalled();
  });

  it('throws when likedByMe=true is sent without auth', async () => {
    const methodRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    await expect(
      service.listWithProfitResponse({
        page: '1',
        perPage: '10',
        likedByMe: 'true',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when variants query param is invalid', async () => {
    const methodRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    await expect(
      service.listWithProfitResponse({
        page: '1',
        perPage: '10',
        variants: 'foo',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when members and show_only_free_to_play are used together', async () => {
    const methodRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    await expect(
      service.listWithProfitResponse({
        page: '1',
        perPage: '10',
        members: 'false',
        show_only_free_to_play: 'true',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sorts by likes and includes likedByMe when auth token is present', async () => {
    const methodOne = buildMethodFixture();
    methodOne.id = 'm1';
    methodOne.variants[0].id = 'm1v1';
    methodOne.variants[1].id = 'm1v2';

    const methodTwo = buildMethodFixture();
    methodTwo.id = 'm2';
    methodTwo.name = 'Method Two';
    methodTwo.slug = 'method-two';
    methodTwo.variants[0].id = 'm2v1';
    methodTwo.variants[1].id = 'm2v2';

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodOne, methodTwo]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(
        [
          { methodId: 'm1', likesCount: '1' },
          { methodId: 'm2', likesCount: '5' },
        ],
        ['m2'],
      ),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockResolvedValue(
      JSON.stringify([
        {
          m1: {
            m1v1: { low: 0, high: 100 },
            m1v2: { low: 0, high: 50 },
          },
          m2: {
            m2v1: { low: 0, high: 100 },
            m2v2: { low: 0, high: 50 },
          },
        },
      ]),
    );

    jest.spyOn(service as any, 'verifySupabaseToken').mockResolvedValue('user-1');

    const result = (await service.listWithProfitResponse({
      page: '1',
      perPage: '10',
      sortBy: 'likes',
      order: 'desc',
      authorization: 'Bearer token',
    })) as {
      data: {
        methods: Array<{ id: string; likes: number; likedByMe: boolean }>;
      };
    };

    expect(result.data.methods).toHaveLength(2);
    expect(result.data.methods[0]).toMatchObject({
      id: 'm2',
      likes: 5,
      likedByMe: true,
    });
    expect(result.data.methods[1]).toMatchObject({
      id: 'm1',
      likes: 1,
      likedByMe: false,
    });
  });

  it('sorts by gpPerXpHigh when skill is provided', async () => {
    const methodOne = buildMethodFixture();
    methodOne.id = 'm1';
    methodOne.name = 'Method One';
    methodOne.slug = 'method-one';
    methodOne.variants = [methodOne.variants[0]];
    methodOne.variants[0].id = 'm1v1';
    methodOne.variants[0].xpHour = [{ skill: 'Magic', experience: 5000 }];

    const methodTwo = buildMethodFixture();
    methodTwo.id = 'm2';
    methodTwo.name = 'Method Two';
    methodTwo.slug = 'method-two';
    methodTwo.variants = [methodTwo.variants[0]];
    methodTwo.variants[0].id = 'm2v1';
    methodTwo.variants[0].xpHour = [{ skill: 'Magic', experience: 1000 }];

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodOne, methodTwo]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'getAllMethodsProfits').mockResolvedValue({
      m1: { m1v1: { low: 1000, high: 5000 } }, // 1 gp/xp high
      m2: { m2v1: { low: 500, high: 4000 } }, // 4 gp/xp high
    });
    jest.spyOn(service as any, 'getItemPrices').mockResolvedValue({});
    jest.spyOn(service as any, 'getItemVolumes24h').mockResolvedValue({});

    const result = (await service.listWithProfitResponse({
      page: '1',
      perPage: '10',
      skill: 'magic',
      sortBy: 'gpPerXpHigh',
      order: 'desc',
    })) as {
      data: {
        methods: Array<{ id: string; variants: Array<{ gpPerXpHigh?: number }> }>;
      };
    };

    expect(result.data.methods).toHaveLength(2);
    expect(result.data.methods[0].id).toBe('m2');
    expect(result.data.methods[0].variants[0].gpPerXpHigh).toBe(4);
    expect(result.data.methods[1].id).toBe('m1');
    expect(result.data.methods[1].variants[0].gpPerXpHigh).toBe(1);
  });

  it('includes pageSize and hasNext in list metadata while keeping perPage', async () => {
    const methodOne = buildMethodFixture();
    methodOne.id = 'm1';
    methodOne.variants[0].id = 'm1v1';
    methodOne.variants[1].id = 'm1v2';

    const methodTwo = buildMethodFixture();
    methodTwo.id = 'm2';
    methodTwo.name = 'Method Two';
    methodTwo.slug = 'method-two';
    methodTwo.variants[0].id = 'm2v1';
    methodTwo.variants[1].id = 'm2v2';

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodOne, methodTwo]),
    } as unknown as Repository<Method>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    call.mockResolvedValue(
      JSON.stringify([
        {
          m1: {
            m1v1: { low: 0, high: 100 },
            m1v2: { low: 0, high: 50 },
          },
          m2: {
            m2v1: { low: 0, high: 80 },
            m2v2: { low: 0, high: 60 },
          },
        },
      ]),
    );

    const result = (await service.listWithProfitResponse({
      page: '1',
      perPage: '1',
    })) as {
      data: { methods: Array<{ id: string }> };
      meta: { total: number; page: number; pageSize: number; perPage: number; hasNext: boolean };
    };

    expect(result.data.methods).toHaveLength(1);
    expect(result.meta).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 1,
      perPage: 1,
      hasNext: true,
    });
  });

  it('includes auto-calculated tags on list variants', async () => {
    const methodEntity = buildMethodFixture();
    methodEntity.id = 'm1';
    methodEntity.variants = [methodEntity.variants[0]];
    methodEntity.variants[0].id = 'v1';
    methodEntity.variants[0].ioItems = [
      Object.assign(new VariantIoItem(), {
        id: 1,
        itemId: 100,
        quantity: 1200,
        type: 'input',
        reason: null,
        createdAt: new Date(),
        variant: methodEntity.variants[0],
      }),
      Object.assign(new VariantIoItem(), {
        id: 2,
        itemId: 200,
        quantity: 1500,
        type: 'output',
        reason: null,
        createdAt: new Date(),
        variant: methodEntity.variants[0],
      }),
    ];

    const methodRepo = {
      find: jest.fn().mockResolvedValue([methodEntity]),
    } as unknown as Repository<Method>;

    const historyRepo = {
      query: jest.fn().mockResolvedValue([
        {
          variantId: 'v1',
          minLowProfit: 100,
          minHighProfit: 200,
          sampleCount: 12,
        },
      ]),
    } as unknown as Repository<VariantHistory>;

    const itemRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          buildItemFixture({ id: 100, name: 'Coal', buyLimit: 4000 }),
          buildItemFixture({ id: 200, name: 'Rune bar', buyLimit: 10000 }),
        ]),
    } as unknown as Repository<Item>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      historyRepo,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
      itemRepo,
    );

    jest.spyOn(service as any, 'getAllMethodsProfits').mockResolvedValue({
      m1: {
        v1: { low: 8_100_000, high: 10_800_000 },
      },
    });
    jest.spyOn(service as any, 'getItemPrices').mockResolvedValue({
      100: { high: 12_000, low: 11_000 },
      200: { high: 16_000, low: 15_000 },
    });
    jest.spyOn(service as any, 'getItemVolumes24h').mockResolvedValue({
      100: { high24h: 960, low24h: 960 },
      200: { high24h: 960, low24h: 960 },
    });

    const result = (await service.findAllWithProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { sortBy: 'highProfit', order: 'desc' },
    )) as {
      data: Array<{
        variants: Array<{
          tags: Array<{ label: string; description: string; severity: number }>;
        }>;
      }>;
    };

    expect(result.data[0].variants[0].tags.map((tag) => [tag.label, tag.severity])).toEqual([
      ['GE limits', 2],
      ['High investment required', 2],
      ['Not viable', 3],
      ['Safe', 1],
      ['Very Slow to buy inputs', 2],
      ['Very Slow to sell outputs', 2],
    ]);
    expect(result.data[0].variants[0].tags[0].description).toContain('Coal requires 1,200/hour');
    expect(result.data[0].variants[0].tags[1].description).toContain('14,400,000 GP');
    expect(result.data[0].variants[0].tags[2].description).toContain('1.4 days');
  });

  it('includes auto-calculated tags on method detail variants', async () => {
    const methodEntity = buildMethodFixture();
    methodEntity.id = 'm1';
    methodEntity.enabled = true;
    methodEntity.variants = [methodEntity.variants[0]];
    methodEntity.variants[0].id = 'v1';
    methodEntity.variants[0].ioItems = [
      Object.assign(new VariantIoItem(), {
        id: 1,
        itemId: 100,
        quantity: 10,
        type: 'input',
        reason: null,
        createdAt: new Date(),
        variant: methodEntity.variants[0],
      }),
      Object.assign(new VariantIoItem(), {
        id: 2,
        itemId: 200,
        quantity: 10,
        type: 'output',
        reason: null,
        createdAt: new Date(),
        variant: methodEntity.variants[0],
      }),
    ];

    const methodRepo = {
      findOne: jest.fn().mockResolvedValue(methodEntity),
    } as unknown as Repository<Method>;

    const historyRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<VariantHistory>;

    const methodLikeRepo = {
      count: jest.fn().mockResolvedValue(0),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as Repository<MethodLike>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      historyRepo,
      methodLikeRepo,
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'getMethodProfits').mockResolvedValue({
      v1: { low: -100, high: 200 },
    });
    jest.spyOn(service as any, 'getItemPrices').mockResolvedValue({
      100: { high: 100, low: 90 },
      200: { high: 150, low: 140 },
    });
    jest.spyOn(service as any, 'getItemVolumes24h').mockResolvedValue({
      100: { high24h: 2400, low24h: 2400 },
      200: { high24h: 2400, low24h: 2400 },
    });

    const result = (await service.findMethodDetailsWithProfit('m1')) as unknown as {
      variants: Array<{ tags: Array<{ label: string; severity: number }> }>;
    };

    expect(result.variants[0].tags).toEqual([
      expect.objectContaining({ label: 'Risky to lose money', severity: 3 }),
    ]);
  });

  it('denies method detail for disabled method when user is not super_admin', async () => {
    const methodRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'm1', enabled: false }),
    } as unknown as Repository<Method>;

    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', role: 'user' }),
    } as unknown as Repository<User>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      userRepo,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'verifySupabaseToken').mockResolvedValue('user-1');
    const methodDetails: MethodDetailsWithProfitResult = {
      id: 'm1',
      enabled: false,
      variants: [],
      likes: 0,
      name: 'Method 1',
      slug: 'method-1',
    };
    const findDetailsSpy = jest
      .spyOn(service, 'findMethodDetailsWithProfit')
      .mockResolvedValue(methodDetails);

    await expect(
      service.methodDetailsWithProfitResponse('m1', undefined, 'Bearer token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findDetailsSpy).not.toHaveBeenCalled();
  });

  it('allows method detail for disabled method when user is super_admin', async () => {
    const methodRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'm1', enabled: false }),
    } as unknown as Repository<Method>;

    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', role: 'super_admin' }),
    } as unknown as Repository<User>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      userRepo,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'verifySupabaseToken').mockResolvedValue('user-1');
    const methodDetails: MethodDetailsWithProfitResult = {
      id: 'm1',
      enabled: false,
      variants: [],
      likes: 0,
      name: 'Method 1',
      slug: 'method-1',
    };
    jest.spyOn(service, 'findMethodDetailsWithProfit').mockResolvedValue(methodDetails);

    const result = (await service.methodDetailsWithProfitResponse(
      'm1',
      undefined,
      'Bearer token',
    )) as { status: string; data: { method: { id: string } } };

    expect(result.status).toBe('ok');
    expect(result.data.method.id).toBe('m1');
  });

  it('rejects create when free-to-play variants include members-only items', async () => {
    const createMethod = jest.fn();
    const saveMethod = jest.fn();
    const methodRepo = {
      create: createMethod,
      save: saveMethod,
    } as unknown as Repository<Method>;

    const itemRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 100, name: 'Members item', members: true },
        { id: 101, name: 'Another members item', members: true },
        { id: 4151, name: 'Method icon', members: false },
        { id: 4152, name: 'Variant icon', members: false },
      ]),
    } as unknown as Repository<Item>;

    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
      itemRepo,
    );

    await expect(
      service.create({
        name: 'Test method',
        icon_id: 4151,
        variants: [
          {
            label: 'Variant A',
            icon_id: 4152,
            members: false,
            inputs: [{ id: 100, quantity: 1, type: 'input' }],
            outputs: [],
          },
          {
            label: 'Variant B',
            icon_id: 4152,
            members: false,
            inputs: [],
            outputs: [{ id: 101, quantity: 1, type: 'output' }],
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'F2P_VARIANT_CONTAINS_MEMBERS_ITEMS',
        details: {
          variants: [
            {
              variantTitle: 'Variant A',
              membersOnlyItems: [{ id: 100, name: 'Members item' }],
            },
            {
              variantTitle: 'Variant B',
              membersOnlyItems: [{ id: 101, name: 'Another members item' }],
            },
          ],
        },
      },
    });

    expect(createMethod).not.toHaveBeenCalled();
    expect(saveMethod).not.toHaveBeenCalled();
  });

  it('rejects updateVariant when the resulting free-to-play variant includes members-only items', async () => {
    const existingMethod = { id: 'm1' } as Method;
    const existingVariant = Object.assign(new MethodVariant(), {
      id: 'v1',
      label: 'Existing F2P variant',
      members: false,
      method: existingMethod,
      ioItems: [],
    });

    const saveVariant = jest.fn();
    const variantRepo = {
      findOne: jest.fn().mockResolvedValue(existingVariant),
      save: saveVariant,
    } as unknown as Repository<MethodVariant>;

    const deleteIoItems = jest.fn();
    const ioRepo = {
      delete: deleteIoItems,
    } as unknown as Repository<VariantIoItem>;

    const itemRepo = {
      find: jest.fn().mockResolvedValue([{ id: 100, name: 'Members item', members: true }]),
    } as unknown as Repository<Item>;

    const service = new MethodsService(
      {} as Repository<Method>,
      variantRepo,
      ioRepo,
      {} as Repository<VariantHistory>,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
      itemRepo,
    );

    await expect(
      service.updateVariant('v1', {
        inputs: [{ id: 100, quantity: 1, type: 'input' }],
        outputs: [],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'F2P_VARIANT_CONTAINS_MEMBERS_ITEMS',
        details: {
          variants: [
            {
              variantTitle: 'Existing F2P variant',
              membersOnlyItems: [{ id: 100, name: 'Members item' }],
            },
          ],
        },
      },
    });

    expect(deleteIoItems).not.toHaveBeenCalled();
    expect(saveVariant).not.toHaveBeenCalled();
  });
});

describe('MethodsService trending profit', () => {
  const now = new Date('2026-07-07T12:00:00.000Z');
  const previousTimestamps = [
    new Date('2026-07-05T13:00:00.000Z'),
    new Date('2026-07-06T00:00:00.000Z'),
    new Date('2026-07-06T11:00:00.000Z'),
  ];
  const currentTimestamps = [
    new Date('2026-07-06T13:00:00.000Z'),
    new Date('2026-07-07T00:00:00.000Z'),
    new Date('2026-07-07T11:00:00.000Z'),
  ];

  const buildVariant = (id: string, label = id): MethodVariant =>
    ({
      id,
      slug: id,
      label,
      description: null,
      xpHour: null,
      clickIntensity: 0,
      afkiness: 0,
      riskLevel: '0',
      requirements: null,
      recommendations: null,
      wilderness: false,
      members: false,
      actionsPerHour: 0,
      createdAt: new Date(),
      ioItems: [],
      method: {} as Method,
    }) as MethodVariant;

  const buildMethod = (id: string, variants: MethodVariant[]): Method =>
    ({
      id,
      name: `Method ${id}`,
      slug: `method-${id}`,
      description: undefined,
      category: 'Skilling',
      enabled: true,
      createdAt: new Date(),
      variants,
    }) as Method;

  const createTrendingService = (
    methods: Method[],
    historyRows: Array<{
      variantId: string;
      timestamp: Date | string;
      lowProfit: number;
      highProfit: number;
    }>,
  ) => {
    const methodRepo = {
      find: jest.fn().mockResolvedValue(methods),
    } as unknown as Repository<Method>;
    const historyQuery = jest.fn().mockResolvedValue(historyRows);
    const historyRepo = {
      query: historyQuery,
    } as unknown as Repository<VariantHistory>;
    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      historyRepo,
      createMethodLikeRepo(),
      {} as Repository<User>,
      {} as VariantSnapshotService,
      {} as RuneScapeApiService,
      { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService,
    );

    jest.spyOn(service as any, 'getItemPrices').mockResolvedValue({});
    jest.spyOn(service as any, 'getItemVolumes24h').mockResolvedValue({});

    return { service, historyQuery };
  };

  const buildHistoryRows = (
    variantId: string,
    previousProfits: number[],
    currentProfits: number[],
  ): Array<{ variantId: string; timestamp: Date; lowProfit: number; highProfit: number }> => [
    ...previousProfits.map((profit, index) => ({
      variantId,
      timestamp: previousTimestamps[index],
      lowProfit: profit,
      highProfit: profit,
    })),
    ...currentProfits.map((profit, index) => ({
      variantId,
      timestamp: currentTimestamps[index],
      lowProfit: profit,
      highProfit: profit,
    })),
  ];

  interface TrendingProfitTestVariant {
    id: string;
    profitGrowth: {
      previousPeriodProfit?: number;
      currentPeriodProfit?: number;
      growthAbs?: number;
      growthPct?: number | null;
      trendDirection?: 'up' | 'down' | 'flat';
    };
  }

  interface TrendingProfitTestMethod {
    id: string;
    variants: TrendingProfitTestVariant[];
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    call.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('uses period-over-period medians and orders by absolute growth instead of percentage', async () => {
    const small = buildMethod('small', [buildVariant('v-small')]);
    const big = buildMethod('big', [buildVariant('v-big')]);
    const { service } = createTrendingService(
      [small, big],
      [
        ...buildHistoryRows('v-small', [1, 1, 1], [1_000, 1_000, 1_000]),
        ...buildHistoryRows(
          'v-big',
          [1_000_000, 1_000_000, 1_000_000],
          [1_300_000, 1_300_000, 1_300_000],
        ),
      ],
    );

    const result = await service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { window: '24h', mode: 'reliable', minGrowthAbs: 0, minCurrentProfit: 0 },
    );
    const methods = result.data as TrendingProfitTestMethod[];

    expect(methods.map((method) => method.id)).toEqual(['big', 'small']);
    expect(methods[0].variants[0].profitGrowth).toMatchObject({
      previousPeriodProfit: 1_000_000,
      currentPeriodProfit: 1_300_000,
      growthAbs: 300_000,
      growthPct: 30,
      trendDirection: 'up',
    });
    expect(methods[0].variants[0].profitGrowth).not.toHaveProperty('selectedGrowthAbs');
    expect(methods[0].variants[0].profitGrowth).not.toHaveProperty('sampleCountPrevious');
    expect(methods[0].variants[0].profitGrowth).not.toHaveProperty('lowGrowthAbs');
    expect(methods[1].variants[0].profitGrowth.growthPct).toBe(99_900);
  });

  it('uses median so a previous-period spike does not contaminate the trend', async () => {
    const method = buildMethod('m1', [buildVariant('v1')]);
    const { service } = createTrendingService(
      [method],
      buildHistoryRows('v1', [100_000, 500_000, 105_000], [150_000, 155_000, 160_000]),
    );

    const result = await service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { window: '24h', mode: 'reliable', minGrowthAbs: 0, minCurrentProfit: 0 },
    );
    const methods = result.data as TrendingProfitTestMethod[];

    expect(methods[0].variants[0].profitGrowth).toMatchObject({
      previousPeriodProfit: 105_000,
      currentPeriodProfit: 155_000,
      growthAbs: 50_000,
    });
    expect(methods[0].variants[0].profitGrowth.growthPct).toBeCloseTo(47.619, 3);
  });

  it('uses reliable growth as the minimum growth across low and high profit', async () => {
    const method = buildMethod('m1', [buildVariant('v1'), buildVariant('v2')]);
    const { service } = createTrendingService(
      [method],
      [
        ...[
          ...previousTimestamps.map((timestamp) => ({
            variantId: 'v1',
            timestamp,
            lowProfit: 100,
            highProfit: 100,
          })),
          ...currentTimestamps.map((timestamp) => ({
            variantId: 'v1',
            timestamp,
            lowProfit: 300,
            highProfit: 120,
          })),
        ],
        ...[
          ...previousTimestamps.map((timestamp) => ({
            variantId: 'v2',
            timestamp,
            lowProfit: 100,
            highProfit: 100,
          })),
          ...currentTimestamps.map((timestamp) => ({
            variantId: 'v2',
            timestamp,
            lowProfit: 180,
            highProfit: 180,
          })),
        ],
      ],
    );

    const result = await service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { window: '24h', mode: 'reliable', minGrowthAbs: 0, minCurrentProfit: 0 },
    );
    const methods = result.data as TrendingProfitTestMethod[];

    expect(methods[0].variants[0]).toMatchObject({
      id: 'v2',
      profitGrowth: { growthAbs: 80, growthPct: 80 },
    });
  });

  it('switches selected growth for instant and slow modes', async () => {
    const method = buildMethod('m1', [buildVariant('v-instant'), buildVariant('v-slow')]);
    const baselineRows = [
      ...previousTimestamps.map((timestamp) => ({
        variantId: 'v-instant',
        timestamp,
        lowProfit: 100,
        highProfit: 100,
      })),
      ...currentTimestamps.map((timestamp) => ({
        variantId: 'v-instant',
        timestamp,
        lowProfit: 300,
        highProfit: 110,
      })),
      ...previousTimestamps.map((timestamp) => ({
        variantId: 'v-slow',
        timestamp,
        lowProfit: 100,
        highProfit: 100,
      })),
      ...currentTimestamps.map((timestamp) => ({
        variantId: 'v-slow',
        timestamp,
        lowProfit: 120,
        highProfit: 500,
      })),
    ];

    const instant = createTrendingService([method], baselineRows);

    const instantResult = await instant.service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { window: '24h', mode: 'instant', minGrowthAbs: 0, minCurrentProfit: 0 },
    );
    const instantMethods = instantResult.data as TrendingProfitTestMethod[];

    expect(instantMethods[0].variants[0]).toMatchObject({
      id: 'v-instant',
      profitGrowth: { growthAbs: 200 },
    });

    jest.restoreAllMocks();
    const slow = createTrendingService([method], baselineRows);

    const slowResult = await slow.service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { window: '24h', mode: 'slow', minGrowthAbs: 0, minCurrentProfit: 0 },
    );
    const slowMethods = slowResult.data as TrendingProfitTestMethod[];

    expect(slowMethods[0].variants[0]).toMatchObject({
      id: 'v-slow',
      profitGrowth: { growthAbs: 400 },
    });
  });

  it('excludes variants when previous or current median profit is not positive', async () => {
    const method = buildMethod('m1', [buildVariant('v1')]);
    const { service } = createTrendingService(
      [method],
      buildHistoryRows('v1', [0, 0, 0], [100, 100, 100]),
    );

    const result = await service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { window: '24h', mode: 'reliable', minGrowthAbs: 0, minCurrentProfit: 0 },
    );

    expect(result.data).toHaveLength(0);
  });

  it('excludes variants without enough samples in both periods', async () => {
    const method = buildMethod('m1', [
      buildVariant('v-good'),
      buildVariant('v-missing'),
      buildVariant('v-insufficient'),
    ]);
    const { service, historyQuery } = createTrendingService(
      [method],
      [
        ...buildHistoryRows('v-good', [100, 100, 100], [200, 250, 300]),
        {
          variantId: 'v-insufficient',
          timestamp: previousTimestamps[0],
          lowProfit: 100,
          highProfit: 100,
        },
        {
          variantId: 'v-insufficient',
          timestamp: currentTimestamps[0],
          lowProfit: 200,
          highProfit: 200,
        },
      ],
    );

    const result = await service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { window: '24h', mode: 'reliable', minGrowthAbs: 0, minCurrentProfit: 0 },
      {},
      'all',
    );

    expect(result.data).toHaveLength(1);
    const methods = result.data as TrendingProfitTestMethod[];
    expect(methods[0].variants[0].id).toBe('v-good');
    expect(historyQuery).toHaveBeenCalledWith(expect.stringContaining('variant_id IN'), [
      'v-good',
      'v-missing',
      'v-insufficient',
      '2026-07-05T12:00:00.000Z',
      '2026-07-07T12:00:00.000Z',
    ]);
  });

  it('returns one row per variant when variants mode is all', async () => {
    const method = buildMethod('m1', [buildVariant('v1'), buildVariant('v2')]);
    const { service } = createTrendingService(
      [method],
      [
        ...buildHistoryRows('v1', [100, 100, 100], [200, 200, 200]),
        ...buildHistoryRows('v2', [100, 100, 100], [300, 300, 300]),
      ],
    );

    const result = await service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true },
      { window: '24h', mode: 'reliable', minGrowthAbs: 0, minCurrentProfit: 0 },
      {},
      'all',
    );

    expect(result.total).toBe(2);
    const methods = result.data as TrendingProfitTestMethod[];
    expect(methods.map((methodRow) => methodRow.variants[0].id)).toEqual(['v2', 'v1']);
  });

  it('filters trending variants by members flag', async () => {
    const method = buildMethod('m1', [buildVariant('v1'), buildVariant('v2')]);
    method.variants[0].members = false;
    method.variants[1].members = true;
    const { service } = createTrendingService(
      [method],
      [
        ...buildHistoryRows('v1', [100, 100, 100], [200, 200, 200]),
        ...buildHistoryRows('v2', [100, 100, 100], [300, 300, 300]),
      ],
    );

    const result = await service.findTrendingProfit(
      1,
      10,
      undefined,
      { enabled: true, members: false },
      { window: '24h', mode: 'reliable', minGrowthAbs: 0, minCurrentProfit: 0 },
      {},
      'all',
    );

    expect(result.total).toBe(1);
    const methods = result.data as TrendingProfitTestMethod[];
    expect(methods[0].variants[0]).toMatchObject({ id: 'v1', members: false });
  });

  it('requires authentication for likedByMe trending filter', async () => {
    const { service } = createTrendingService([], []);

    await expect(service.listTrendingProfitResponse({ likedByMe: 'true' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
