import { MethodsService } from './methods.service';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { Repository } from 'typeorm';
import { VariantIoItem } from './entities/io-item.entity';
import { VariantHistory } from './entities/variant-history.entity';
import { VariantSnapshotService } from '../variant-snapshots/variant-snapshot.service';
import { RuneScapeApiService } from './RuneScapeApiService';
import { buildMethodFixture } from '../testing/fixtures';
import type { ConfigService } from '@nestjs/config';
import { User } from '../auth/entities/user.entity';
import { ForbiddenException } from '@nestjs/common';

const call = jest.fn();
const quit = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ call, quit })),
}));

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
    expect(result.data[0].variants).toHaveLength(1);
    expect(result.data[0].variants[0].id).toBe('v2');
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
});
