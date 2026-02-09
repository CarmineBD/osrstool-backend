import { MethodsService } from './methods.service';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { Repository } from 'typeorm';
import { VariantIoItem } from './entities/io-item.entity';
import { VariantHistory } from './entities/variant-history.entity';
import { MethodLike } from './entities/method-like.entity';
import { VariantSnapshotService } from '../variant-snapshots/variant-snapshot.service';
import { RuneScapeApiService } from './RuneScapeApiService';
import { buildMethodFixture } from '../testing/fixtures';
import type { ConfigService } from '@nestjs/config';
import { User } from '../auth/entities/user.entity';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

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
});
