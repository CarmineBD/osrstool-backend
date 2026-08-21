const redisCall = jest.fn();
const redisQuit = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ call: redisCall, quit: redisQuit })),
  __call: redisCall,
}));

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Server } from 'http';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';
import { buildItemFixture, buildMethodFixture } from '../src/testing/fixtures';
import { Item } from '../src/items/entities/item.entity';
import { Method } from '../src/methods/entities/method.entity';
import { MethodVariant } from '../src/methods/entities/variant.entity';
import { VariantIoItem } from '../src/methods/entities/io-item.entity';
import { VariantHistory } from '../src/methods/entities/variant-history.entity';
import { ActionType } from '../src/methods/action-type.enum';
import { createPgMemAdapter } from './utils/pg-mem';
import { User } from '../src/auth/entities/user.entity';

jest.mock('pg', () => createPgMemAdapter());

const TEST_AUTH_USER_ID = '11111111-1111-1111-1111-111111111111';

describe('Methods (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  type CreateMethodPayload = {
    name: string;
    icon_id: number;
    description: string;
    category: string;
    enabled: boolean;
    variants: Array<{
      label: string;
      icon_id: number;
      actionsPerHour?: number;
      actionType?: ActionType;
      description?: string;
      members?: boolean;
      requirements?: Record<string, unknown>;
      inputs: Array<{ id: number; quantity: number; type: 'input' | 'output'; reason?: string }>;
      outputs: Array<{ id: number; quantity: number; type: 'input' | 'output'; reason?: string }>;
    }>;
  };

  const expectUnsafeMarkdownValidationMessage = (body: { message?: unknown }): void => {
    const messages = Array.isArray(body.message)
      ? body.message.map(String)
      : [String(body.message)];
    expect(
      messages.some((message) => message.includes('must not contain unsafe markdown/html content')),
    ).toBe(true);
  };

  const buildValidCreateMethodPayload = (): CreateMethodPayload => ({
    name: 'Validated method',
    icon_id: 4151,
    description: 'Texto **markdown** con [link](https://example.com)',
    category: 'Skilling',
    enabled: true,
    variants: [
      {
        label: 'Validated variant',
        icon_id: 4152,
        actionsPerHour: 2,
        actionType: ActionType.ITEMS,
        description: 'Lista:\n- item 1\n- item 2',
        inputs: [{ id: 100, quantity: 1, type: 'input', reason: 'Reason text' }],
        outputs: [{ id: 200, quantity: 1, type: 'output', reason: 'Reason text' }],
      },
    ],
  });

  const seedItems = async (
    ...items: Array<number | { id: number; members?: boolean; name?: string }>
  ) => {
    const itemRepo = dataSource.getRepository(Item);
    await itemRepo.save(
      items.map((item) => {
        const config =
          typeof item === 'number'
            ? { id: item, members: false, name: `Item ${item}` }
            : {
                id: item.id,
                members: item.members ?? false,
                name: item.name ?? `Item ${item.id}`,
              };

        return buildItemFixture({
          id: config.id,
          name: config.name,
          iconPath: `Item_${config.id}.png`,
          members: config.members,
        });
      }),
    );
  };

  const mockRedisProfits = (
    profits: Record<string, Record<string, { low: number; high: number }>>,
  ) => {
    redisCall.mockImplementation((command: string, key: string, field?: string) => {
      if (command === 'HGETALL' && key === 'methods:profits') {
        return Promise.resolve(
          Object.fromEntries(
            Object.entries(profits).map(([methodId, methodProfits]) => [
              methodId,
              JSON.stringify(methodProfits),
            ]),
          ),
        );
      }

      if (command === 'HGET' && key === 'methods:profits' && field) {
        return Promise.resolve(JSON.stringify(profits[field] ?? {}));
      }

      if (command === 'HMGET') {
        return Promise.resolve([]);
      }

      return Promise.resolve(null);
    });
  };

  const buildStoredMethodPayload = (overrides: Partial<Method>): Partial<Method> => ({
    createdBy: TEST_AUTH_USER_ID,
    isOfficial: true,
    ...overrides,
  });

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM "variant_io_items"');
    await dataSource.query('DELETE FROM "method_variants"');
    await dataSource.query('DELETE FROM "money_making_methods"');
    await dataSource.query('DELETE FROM "users"');
    await dataSource.query('DELETE FROM "items"');
    await dataSource.getRepository(User).save({
      id: TEST_AUTH_USER_ID,
      email: 'admin@example.com',
      accountUsername: 'admin_user',
      role: 'super_admin',
      plan: 'free',
    });
    redisCall.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /methods/search returns best variant and variantCount', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);
    const ioRepo = dataSource.getRepository(VariantIoItem);
    const seed = buildMethodFixture();

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        category: seed.category,
      }),
    );

    const [variantA, variantB] = seed.variants;
    const savedVariantA = await variantRepo.save({
      label: variantA.label,
      slug: variantA.slug,
      description: variantA.description,
      xpHour: variantA.xpHour,
      clickIntensity: variantA.clickIntensity,
      afkiness: variantA.afkiness,
      riskLevel: variantA.riskLevel,
      requirements: variantA.requirements,
      recommendations: variantA.recommendations,
      wilderness: variantA.wilderness,
      actionsPerHour: variantA.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const savedVariantB = await variantRepo.save({
      label: variantB.label,
      slug: variantB.slug,
      description: variantB.description,
      xpHour: variantB.xpHour,
      clickIntensity: variantB.clickIntensity,
      afkiness: variantB.afkiness,
      riskLevel: variantB.riskLevel,
      requirements: variantB.requirements,
      recommendations: variantB.recommendations,
      wilderness: variantB.wilderness,
      actionsPerHour: variantB.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    await ioRepo.save(
      variantA.ioItems.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        quantity: item.quantity,
        variant: savedVariantA,
      })),
    );
    await ioRepo.save(
      variantB.ioItems.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        quantity: item.quantity,
        variant: savedVariantB,
      })),
    );

    const variantIds = [savedVariantA.id, savedVariantB.id];
    mockRedisProfits({
      [savedMethod.id]: {
        [variantIds[0]]: { low: 100, high: 200 },
        [variantIds[1]]: { low: 50, high: 300 },
      },
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server).post('/methods/search').send({}).expect(200);

    const body = res.body as {
      status: string;
      data: { methods: Array<{ variantCount: number; variants: Array<{ id: string }> }> };
      meta: {
        total: number;
        page: number;
        pageSize: number;
        perPage: number;
        hasNext: boolean;
      };
    };
    expect(body.status).toBe('ok');
    expect(body.data.methods).toHaveLength(1);
    expect(body.meta).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      perPage: 10,
      hasNext: false,
    });
    const result = body.data.methods[0];
    expect(result.variantCount).toBe(2);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].id).toBe(variantIds[1]);
  });

  it('rejects malformed nested player context with a validation error', async () => {
    const server = app.getHttpServer() as unknown as Server;

    const res = await request(server).post('/methods/search').send({ player: {} }).expect(400);
    const body = res.body as { message?: unknown };

    const messages = Array.isArray(body.message) ? body.message.map(String) : [];
    expect(messages).toEqual(
      expect.arrayContaining([
        'player.levels must be an object',
        'player.experience must be an object',
        'player.quests must be an object',
        'player.achievement_diaries must be an object',
      ]),
    );
  });

  it('POST /methods/search?variants=all returns one row per variant', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);
    const ioRepo = dataSource.getRepository(VariantIoItem);
    const seed = buildMethodFixture();

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        category: seed.category,
      }),
    );

    const [variantA, variantB] = seed.variants;
    const savedVariantA = await variantRepo.save({
      label: variantA.label,
      slug: variantA.slug,
      description: variantA.description,
      xpHour: variantA.xpHour,
      clickIntensity: variantA.clickIntensity,
      afkiness: variantA.afkiness,
      riskLevel: variantA.riskLevel,
      requirements: variantA.requirements,
      recommendations: variantA.recommendations,
      wilderness: variantA.wilderness,
      actionsPerHour: variantA.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const savedVariantB = await variantRepo.save({
      label: variantB.label,
      slug: variantB.slug,
      description: variantB.description,
      xpHour: variantB.xpHour,
      clickIntensity: variantB.clickIntensity,
      afkiness: variantB.afkiness,
      riskLevel: variantB.riskLevel,
      requirements: variantB.requirements,
      recommendations: variantB.recommendations,
      wilderness: variantB.wilderness,
      actionsPerHour: variantB.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    await ioRepo.save(
      variantA.ioItems.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        quantity: item.quantity,
        variant: savedVariantA,
      })),
    );
    await ioRepo.save(
      variantB.ioItems.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        quantity: item.quantity,
        variant: savedVariantB,
      })),
    );

    const variantIds = [savedVariantA.id, savedVariantB.id];
    mockRedisProfits({
      [savedMethod.id]: {
        [variantIds[0]]: { low: 100, high: 200 },
        [variantIds[1]]: { low: 50, high: 300 },
      },
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server).post('/methods/search?variants=all').send({}).expect(200);

    const body = res.body as {
      status: string;
      data: {
        methods: Array<{ id: string; variantCount: number; variants: Array<{ id: string }> }>;
      };
      meta: {
        total: number;
        page: number;
        pageSize: number;
        perPage: number;
        hasNext: boolean;
      };
    };

    expect(body.status).toBe('ok');
    expect(body.data.methods).toHaveLength(2);
    expect(body.meta).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 10,
      perPage: 10,
      hasNext: false,
    });
    expect(body.data.methods[0]).toMatchObject({
      id: savedMethod.id,
      variantCount: 2,
      variants: [{ id: variantIds[1] }],
    });
    expect(body.data.methods[1]).toMatchObject({
      id: savedMethod.id,
      variantCount: 2,
      variants: [{ id: variantIds[0] }],
    });
  });

  it('POST /methods/search?show_only_free_to_play=true&variants=all returns only free-to-play variants', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);
    const seed = buildMethodFixture();

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        category: seed.category,
      }),
    );

    const [variantA, variantB] = seed.variants;
    const savedVariantA = await variantRepo.save({
      label: variantA.label,
      slug: variantA.slug,
      description: variantA.description,
      xpHour: variantA.xpHour,
      clickIntensity: variantA.clickIntensity,
      afkiness: variantA.afkiness,
      riskLevel: variantA.riskLevel,
      requirements: variantA.requirements,
      recommendations: variantA.recommendations,
      wilderness: variantA.wilderness,
      members: false,
      actionsPerHour: variantA.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const savedVariantB = await variantRepo.save({
      label: variantB.label,
      slug: variantB.slug,
      description: variantB.description,
      xpHour: variantB.xpHour,
      clickIntensity: variantB.clickIntensity,
      afkiness: variantB.afkiness,
      riskLevel: variantB.riskLevel,
      requirements: variantB.requirements,
      recommendations: variantB.recommendations,
      wilderness: variantB.wilderness,
      members: true,
      actionsPerHour: variantB.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    mockRedisProfits({
      [savedMethod.id]: {
        [savedVariantA.id]: { low: 100, high: 200 },
        [savedVariantB.id]: { low: 200, high: 400 },
      },
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .post('/methods/search?show_only_free_to_play=true&variants=all')
      .send({})
      .expect(200);

    const body = res.body as {
      data: { methods: Array<{ variants: Array<{ id: string; members: boolean }> }> };
    };

    expect(body.data.methods).toHaveLength(1);
    expect(body.data.methods[0].variants[0]).toMatchObject({
      id: savedVariantA.id,
      members: false,
    });
  });

  it('POST /methods/search?show_only_free_to_play=false&variants=all does not filter out members variants', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);
    const seed = buildMethodFixture();

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        category: seed.category,
      }),
    );

    const [variantA, variantB] = seed.variants;
    const savedVariantA = await variantRepo.save({
      label: variantA.label,
      slug: variantA.slug,
      description: variantA.description,
      xpHour: variantA.xpHour,
      clickIntensity: variantA.clickIntensity,
      afkiness: variantA.afkiness,
      riskLevel: variantA.riskLevel,
      requirements: variantA.requirements,
      recommendations: variantA.recommendations,
      wilderness: variantA.wilderness,
      members: false,
      actionsPerHour: variantA.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const savedVariantB = await variantRepo.save({
      label: variantB.label,
      slug: variantB.slug,
      description: variantB.description,
      xpHour: variantB.xpHour,
      clickIntensity: variantB.clickIntensity,
      afkiness: variantB.afkiness,
      riskLevel: variantB.riskLevel,
      requirements: variantB.requirements,
      recommendations: variantB.recommendations,
      wilderness: variantB.wilderness,
      members: true,
      actionsPerHour: variantB.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    mockRedisProfits({
      [savedMethod.id]: {
        [savedVariantA.id]: { low: 100, high: 200 },
        [savedVariantB.id]: { low: 200, high: 400 },
      },
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .post('/methods/search?show_only_free_to_play=false&variants=all')
      .send({})
      .expect(200);

    const body = res.body as {
      data: { methods: Array<{ variants: Array<{ id: string; members: boolean }> }> };
    };

    expect(body.data.methods).toHaveLength(2);
    expect(body.data.methods[0].variants[0]).toMatchObject({
      members: true,
    });
    expect(body.data.methods[1].variants[0]).toMatchObject({
      members: false,
    });
  });

  it('POST /methods/search?ignoredTags=safe&variants=all excludes variants that contain ignored tags', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);
    const historyRepo = dataSource.getRepository(VariantHistory);
    const seed = buildMethodFixture();

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        category: seed.category,
      }),
    );

    const [variantA, variantB] = seed.variants;
    const savedVariantA = await variantRepo.save({
      label: variantA.label,
      slug: variantA.slug,
      description: variantA.description,
      xpHour: variantA.xpHour,
      clickIntensity: variantA.clickIntensity,
      afkiness: variantA.afkiness,
      riskLevel: variantA.riskLevel,
      requirements: variantA.requirements,
      recommendations: variantA.recommendations,
      wilderness: variantA.wilderness,
      actionsPerHour: variantA.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const savedVariantB = await variantRepo.save({
      label: variantB.label,
      slug: variantB.slug,
      description: variantB.description,
      xpHour: variantB.xpHour,
      clickIntensity: variantB.clickIntensity,
      afkiness: variantB.afkiness,
      riskLevel: variantB.riskLevel,
      requirements: variantB.requirements,
      recommendations: variantB.recommendations,
      wilderness: variantB.wilderness,
      actionsPerHour: variantB.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    await historyRepo.save(
      historyRepo.create({
        variant: savedVariantB,
        timestamp: new Date(),
        lowProfit: 100,
        highProfit: 200,
      }),
    );

    mockRedisProfits({
      [savedMethod.id]: {
        [savedVariantA.id]: { low: 50, high: 150 },
        [savedVariantB.id]: { low: 100, high: 200 },
      },
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .post('/methods/search?ignoredTags=safe&variants=all')
      .send({})
      .expect(200);

    const body = res.body as {
      data: { methods: Array<{ variants: Array<{ id: string; tags: Array<{ label: string }> }> }> };
    };

    expect(body.data.methods).toHaveLength(1);
    expect(body.data.methods[0].variants[0].id).toBe(savedVariantA.id);
    expect(body.data.methods[0].variants[0].tags.map((tag) => tag.label)).not.toContain('Safe');
  });

  it('POST /methods/trending-profit returns methods ordered by profit growth', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);
    const historyRepo = dataSource.getRepository(VariantHistory);
    const seed = buildMethodFixture();

    const smallMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Small mover',
        slug: 'small-mover',
        description: seed.description,
        category: seed.category,
      }),
    );
    const bigMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Big mover',
        slug: 'big-mover',
        description: seed.description,
        category: seed.category,
      }),
    );

    const smallVariant = await variantRepo.save({
      label: 'Small variant',
      slug: 'small-variant',
      description: null,
      xpHour: null,
      clickIntensity: 0,
      afkiness: 0,
      riskLevel: '0',
      requirements: null,
      recommendations: null,
      wilderness: false,
      actionsPerHour: 0,
      actionType: ActionType.ITEMS,
      method: smallMethod,
    });
    const bigVariant = await variantRepo.save({
      label: 'Big variant',
      slug: 'big-variant',
      description: null,
      xpHour: null,
      clickIntensity: 0,
      afkiness: 0,
      riskLevel: '0',
      requirements: null,
      recommendations: null,
      wilderness: false,
      actionsPerHour: 0,
      actionType: ActionType.ITEMS,
      method: bigMethod,
    });

    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
    await historyRepo.save([
      ...[47, 36, 25].map((hours) =>
        historyRepo.create({
          variant: smallVariant,
          timestamp: hoursAgo(hours),
          lowProfit: 1,
          highProfit: 1,
        }),
      ),
      ...[23, 12, 1].map((hours) =>
        historyRepo.create({
          variant: smallVariant,
          timestamp: hoursAgo(hours),
          lowProfit: 1_000,
          highProfit: 1_000,
        }),
      ),
      ...[47, 36, 25].map((hours) =>
        historyRepo.create({
          variant: bigVariant,
          timestamp: hoursAgo(hours),
          lowProfit: 1_000_000,
          highProfit: 1_000_000,
        }),
      ),
      ...[23, 12, 1].map((hours) =>
        historyRepo.create({
          variant: bigVariant,
          timestamp: hoursAgo(hours),
          lowProfit: 1_300_000,
          highProfit: 1_300_000,
        }),
      ),
    ]);

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .post('/methods/trending-profit?window=24h&mode=reliable&variants=all')
      .send({})
      .expect(200);

    const body = res.body as {
      status: string;
      data: {
        methods: Array<{
          id: string;
          variants: Array<{
            id: string;
            profitGrowth: {
              window: string;
              mode: string;
              previousPeriodProfit: number;
              currentPeriodProfit: number;
              growthAbs: number;
              growthPct: number | null;
              trendDirection: string;
            };
          }>;
        }>;
      };
      meta: { total: number; page: number; perPage: number; hasNext: boolean };
    };

    expect(body.status).toBe('ok');
    expect(body.meta).toMatchObject({ total: 2, page: 1, perPage: 10, hasNext: false });
    expect(body.data.methods.map((method) => method.id)).toEqual([bigMethod.id, smallMethod.id]);
    expect(body.data.methods[0].variants[0]).toMatchObject({
      id: bigVariant.id,
      profitGrowth: {
        window: '24h',
        mode: 'reliable',
        previousPeriodProfit: 1_000_000,
        currentPeriodProfit: 1_300_000,
        growthAbs: 300_000,
        growthPct: 30,
        trendDirection: 'up',
      },
    });
    expect(body.data.methods[0].variants[0].profitGrowth).not.toHaveProperty('selectedGrowthAbs');
    expect(body.data.methods[0].variants[0].profitGrowth).not.toHaveProperty('sampleCountPrevious');
    expect(body.data.methods[0].variants[0].profitGrowth).not.toHaveProperty('lowGrowthAbs');
    expect(body.data.methods[1].variants[0].profitGrowth.growthPct).toBe(99_900);

    await request(server).post('/methods/trending-profit?window=1h').send({}).expect(200);
    await request(server).post('/methods/trending-profit?window=7d').send({}).expect(200);
  });

  it('POST /methods/search with skill includes gpPerXpHigh and gpPerXpLow per variant', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);
    const ioRepo = dataSource.getRepository(VariantIoItem);
    const seed = buildMethodFixture();

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        category: seed.category,
      }),
    );

    const [variantA, variantB] = seed.variants;
    const savedVariantA = await variantRepo.save({
      label: variantA.label,
      slug: variantA.slug,
      description: variantA.description,
      xpHour: [
        { skill: 'Crafting', experience: 7000 },
        { skill: 'Magic', experience: 5000 },
      ],
      clickIntensity: variantA.clickIntensity,
      afkiness: variantA.afkiness,
      riskLevel: variantA.riskLevel,
      requirements: variantA.requirements,
      recommendations: variantA.recommendations,
      wilderness: variantA.wilderness,
      actionsPerHour: variantA.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const savedVariantB = await variantRepo.save({
      label: variantB.label,
      slug: variantB.slug,
      description: variantB.description,
      xpHour: [{ skill: 'Magic', experience: 2000 }],
      clickIntensity: variantB.clickIntensity,
      afkiness: variantB.afkiness,
      riskLevel: variantB.riskLevel,
      requirements: variantB.requirements,
      recommendations: variantB.recommendations,
      wilderness: variantB.wilderness,
      actionsPerHour: variantB.actionsPerHour,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    await ioRepo.save(
      variantA.ioItems.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        quantity: item.quantity,
        variant: savedVariantA,
      })),
    );
    await ioRepo.save(
      variantB.ioItems.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        quantity: item.quantity,
        variant: savedVariantB,
      })),
    );

    const variantIds = [savedVariantA.id, savedVariantB.id];
    mockRedisProfits({
      [savedMethod.id]: {
        [variantIds[0]]: { low: 5000, high: 10000 },
        [variantIds[1]]: { low: 4000, high: 8000 },
      },
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .post('/methods/search?skill=magic&variants=all')
      .send({})
      .expect(200);

    const body = res.body as {
      status: string;
      data: {
        methods: Array<{
          variants: Array<{
            id: string;
            gpPerXpHigh?: number;
            gpPerXpLow?: number;
          }>;
        }>;
      };
    };

    expect(body.status).toBe('ok');
    expect(body.data.methods).toHaveLength(2);

    const variantById = new Map(body.data.methods.map((m) => [m.variants[0].id, m.variants[0]]));
    expect(variantById.get(variantIds[0])).toMatchObject({
      gpPerXpHigh: 2,
      gpPerXpLow: 1,
    });
    expect(variantById.get(variantIds[1])).toMatchObject({
      gpPerXpHigh: 4,
      gpPerXpLow: 2,
    });
  });

  it('POST /methods/create stores icon_id and POST /methods/:id returns it for method and variant', async () => {
    await seedItems(100, 200, 4151, 4152);

    const server = app.getHttpServer() as unknown as Server;
    const createRes = await request(server)
      .post('/methods/create')
      .send(buildValidCreateMethodPayload())
      .expect(201);

    const createdBody = createRes.body as {
      data: {
        id: string;
        icon_id: number;
        is_official: boolean;
        variants: Array<{ id: string; icon_id: number }>;
      };
    };

    expect(createdBody.data.icon_id).toBe(4151);
    expect(createdBody.data.is_official).toBe(true);
    expect(createdBody.data.variants[0].icon_id).toBe(4152);

    mockRedisProfits({
      [createdBody.data.id]: {
        [createdBody.data.variants[0].id]: { low: 100, high: 200 },
      },
    });

    const detailRes = await request(server)
      .post(`/methods/${createdBody.data.id}`)
      .send({})
      .expect(200);
    const detailBody = detailRes.body as {
      status: string;
      data: {
        method: {
          id: string;
          icon_id: number;
          is_official: boolean;
          created_by: { id: string; username: string | null } | null;
          created_at: string;
          updated_at: string;
          variants: Array<{ id: string; icon_id: number }>;
        };
      };
    };

    expect(detailBody.status).toBe('ok');
    expect(detailBody.data.method).toMatchObject({
      id: createdBody.data.id,
      icon_id: 4151,
      is_official: true,
      created_by: {
        id: TEST_AUTH_USER_ID,
        username: 'admin_user',
      },
    });
    expect(new Date(detailBody.data.method.created_at).toString()).not.toBe('Invalid Date');
    expect(new Date(detailBody.data.method.updated_at).toString()).not.toBe('Invalid Date');
    expect(detailBody.data.method.variants[0]).toMatchObject({
      id: createdBody.data.variants[0].id,
      icon_id: 4152,
    });
  });

  it('POST /methods/create rejects icon_id values that do not exist in items', async () => {
    await seedItems(100, 200, 4151);

    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    payload.variants[0].icon_id = 999999;

    const res = await request(server).post('/methods/create').send(payload).expect(400);
    const body = res.body as { message?: unknown };
    expect(String(body.message)).toContain('icon_id must reference an existing item');
    expect(String(body.message)).toContain('999999');
  });

  it('POST /methods/create requires actionsPerHour for each variant', async () => {
    await seedItems(100, 200, 4151, 4152);

    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    delete payload.variants[0].actionsPerHour;

    const res = await request(server).post('/methods/create').send(payload).expect(400);
    const body = res.body as { message?: unknown };
    const messages = Array.isArray(body.message)
      ? body.message.map(String)
      : [String(body.message)];

    expect(
      messages.some((message) => message.includes('actionsPerHour must be an integer number')),
    ).toBe(true);
  });

  it('POST /methods/create rejects free-to-play variants that include members-only items', async () => {
    await seedItems(
      { id: 100, members: true, name: 'Abyssal whip' },
      { id: 200, members: false, name: 'Lobster' },
      { id: 300, members: true, name: 'Dragon bones' },
      { id: 4151, members: false, name: 'Method icon' },
      { id: 4152, members: false, name: 'Variant icon' },
    );

    const server = app.getHttpServer() as unknown as Server;
    const payload = {
      ...buildValidCreateMethodPayload(),
      variants: [
        {
          label: 'F2P Cooking',
          icon_id: 4152,
          actionsPerHour: 100,
          actionType: ActionType.ITEMS,
          members: false,
          inputs: [{ id: 100, quantity: 1, type: 'input' }],
          outputs: [{ id: 200, quantity: 1, type: 'output' }],
        },
        {
          label: 'F2P Prayer',
          icon_id: 4152,
          actionsPerHour: 100,
          actionType: ActionType.ITEMS,
          members: false,
          inputs: [],
          outputs: [{ id: 300, quantity: 1, type: 'output' }],
        },
      ],
    };

    const res = await request(server).post('/methods/create').send(payload).expect(400);

    const body = res.body as {
      code: string;
      message: string;
      details: {
        variants: Array<{
          variantTitle: string;
          membersOnlyItems: Array<{ id: number; name: string }>;
        }>;
      };
    };

    expect(body.code).toBe('F2P_VARIANT_CONTAINS_MEMBERS_ITEMS');
    expect(body.message).toContain('Free-to-play variants cannot include members-only items');
    expect(body.details.variants).toEqual([
      {
        variantTitle: 'F2P Cooking',
        membersOnlyItems: [{ id: 100, name: 'Abyssal whip' }],
      },
      {
        variantTitle: 'F2P Prayer',
        membersOnlyItems: [{ id: 300, name: 'Dragon bones' }],
      },
    ]);
  });

  it('PUT /methods/:id rejects icon_id values that do not exist in items', async () => {
    await seedItems(4151, 4152);

    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Editable method',
        slug: 'editable-method',
        iconId: 4151,
        description: 'Safe markdown',
        category: 'Skilling',
        enabled: true,
      }),
    );

    const savedVariant = await variantRepo.save({
      label: 'Editable variant',
      slug: 'editable-variant',
      iconId: 4152,
      description: null,
      xpHour: null,
      clickIntensity: 1,
      afkiness: 1,
      riskLevel: '1',
      requirements: null,
      recommendations: null,
      wilderness: false,
      actionsPerHour: 100,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .put(`/methods/${savedMethod.id}`)
      .send({
        icon_id: 999999,
        variants: [
          {
            id: savedVariant.id,
            label: 'Editable variant',
            icon_id: 4152,
            actionsPerHour: 100,
            actionType: ActionType.ITEMS,
            inputs: [],
            outputs: [],
          },
        ],
      })
      .expect(400);

    const body = res.body as { message?: unknown };
    expect(String(body.message)).toContain('icon_id must reference an existing item');
    expect(String(body.message)).toContain('999999');
  });

  it('PUT /methods/:id requires actionsPerHour for edited variants', async () => {
    await seedItems(4151, 4152);

    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Editable method',
        slug: 'editable-method',
        iconId: 4151,
        description: 'Safe markdown',
        category: 'Skilling',
        enabled: true,
      }),
    );

    const savedVariant = await variantRepo.save({
      label: 'Editable variant',
      slug: 'editable-variant',
      iconId: 4152,
      description: null,
      xpHour: null,
      clickIntensity: 1,
      afkiness: 1,
      riskLevel: '1',
      requirements: null,
      recommendations: null,
      wilderness: false,
      actionsPerHour: 100,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .put(`/methods/${savedMethod.id}`)
      .send({
        variants: [
          {
            id: savedVariant.id,
            label: 'Editable variant',
            icon_id: 4152,
            inputs: [],
            outputs: [],
          },
        ],
      })
      .expect(400);

    const body = res.body as { message?: unknown };
    const messages = Array.isArray(body.message)
      ? body.message.map(String)
      : [String(body.message)];

    expect(
      messages.some((message) => message.includes('actionsPerHour must be an integer number')),
    ).toBe(true);
  });

  it('PUT /methods/:id rejects free-to-play variants that include members-only items', async () => {
    await seedItems(
      { id: 100, members: true, name: 'Abyssal whip' },
      { id: 200, members: false, name: 'Lobster' },
      { id: 4151, members: false, name: 'Method icon' },
      { id: 4152, members: false, name: 'Variant icon' },
    );

    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Editable method',
        slug: 'editable-method',
        iconId: 4151,
        description: 'Safe markdown',
        category: 'Skilling',
        enabled: true,
      }),
    );

    const savedVariant = await variantRepo.save({
      label: 'Existing F2P variant',
      slug: 'existing-f2p-variant',
      iconId: 4152,
      description: null,
      xpHour: null,
      clickIntensity: 1,
      afkiness: 1,
      riskLevel: '1',
      requirements: null,
      recommendations: null,
      wilderness: false,
      members: false,
      actionsPerHour: 100,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .put(`/methods/${savedMethod.id}`)
      .send({
        variants: [
          {
            id: savedVariant.id,
            actionsPerHour: 100,
            actionType: ActionType.ITEMS,
            inputs: [{ id: 100, quantity: 1, type: 'input' }],
            outputs: [{ id: 200, quantity: 1, type: 'output' }],
          },
        ],
      })
      .expect(400);

    const body = res.body as {
      code: string;
      details: {
        variants: Array<{
          variantTitle: string;
          membersOnlyItems: Array<{ id: number; name: string }>;
        }>;
      };
    };

    expect(body.code).toBe('F2P_VARIANT_CONTAINS_MEMBERS_ITEMS');
    expect(body.details.variants).toEqual([
      {
        variantTitle: 'Existing F2P variant',
        membersOnlyItems: [{ id: 100, name: 'Abyssal whip' }],
      },
    ]);
  });

  it('PUT /methods/variant/:id rejects icon_id values that do not exist in items', async () => {
    await seedItems(4151, 4152);

    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Variant edit method',
        slug: 'variant-edit-method',
        iconId: 4151,
        description: 'Safe markdown',
        category: 'Skilling',
        enabled: true,
      }),
    );

    const savedVariant = await variantRepo.save({
      label: 'Variant edit variant',
      slug: 'variant-edit-variant',
      iconId: 4152,
      description: null,
      xpHour: null,
      clickIntensity: 1,
      afkiness: 1,
      riskLevel: '1',
      requirements: null,
      recommendations: null,
      wilderness: false,
      actionsPerHour: 100,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .put(`/methods/variant/${savedVariant.id}`)
      .send({
        icon_id: 999999,
        actionsPerHour: 100,
        actionType: ActionType.ITEMS,
        inputs: [],
        outputs: [],
      })
      .expect(400);

    const body = res.body as { message?: unknown };
    expect(String(body.message)).toContain('icon_id must reference an existing item');
    expect(String(body.message)).toContain('999999');
  });

  it('PUT /methods/variant/:id requires actionsPerHour', async () => {
    await seedItems(4151, 4152);

    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Variant edit method',
        slug: 'variant-edit-method',
        iconId: 4151,
        description: 'Safe markdown',
        category: 'Skilling',
        enabled: true,
      }),
    );

    const savedVariant = await variantRepo.save({
      label: 'Variant edit variant',
      slug: 'variant-edit-variant',
      iconId: 4152,
      description: null,
      xpHour: null,
      clickIntensity: 1,
      afkiness: 1,
      riskLevel: '1',
      requirements: null,
      recommendations: null,
      wilderness: false,
      actionsPerHour: 100,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .put(`/methods/variant/${savedVariant.id}`)
      .send({
        inputs: [],
        outputs: [],
      })
      .expect(400);

    const body = res.body as { message?: unknown };
    const messages = Array.isArray(body.message)
      ? body.message.map(String)
      : [String(body.message)];

    expect(
      messages.some((message) => message.includes('actionsPerHour must be an integer number')),
    ).toBe(true);
  });

  it('PUT /methods/variant/:id rejects free-to-play variants that include members-only items', async () => {
    await seedItems(
      { id: 100, members: true, name: 'Abyssal whip' },
      { id: 200, members: false, name: 'Lobster' },
      { id: 4151, members: false, name: 'Method icon' },
      { id: 4152, members: false, name: 'Variant icon' },
    );

    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Variant edit method',
        slug: 'variant-edit-method',
        iconId: 4151,
        description: 'Safe markdown',
        category: 'Skilling',
        enabled: true,
      }),
    );

    const savedVariant = await variantRepo.save({
      label: 'Variant edit variant',
      slug: 'variant-edit-variant',
      iconId: 4152,
      description: null,
      xpHour: null,
      clickIntensity: 1,
      afkiness: 1,
      riskLevel: '1',
      requirements: null,
      recommendations: null,
      wilderness: false,
      members: false,
      actionsPerHour: 100,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .put(`/methods/variant/${savedVariant.id}`)
      .send({
        actionsPerHour: 100,
        actionType: ActionType.ITEMS,
        inputs: [{ id: 100, quantity: 1, type: 'input' }],
        outputs: [{ id: 200, quantity: 1, type: 'output' }],
      })
      .expect(400);

    const body = res.body as {
      code: string;
      details: {
        variants: Array<{
          variantTitle: string;
          membersOnlyItems: Array<{ id: number; name: string }>;
        }>;
      };
    };

    expect(body.code).toBe('F2P_VARIANT_CONTAINS_MEMBERS_ITEMS');
    expect(body.details.variants).toEqual([
      {
        variantTitle: 'Variant edit variant',
        membersOnlyItems: [{ id: 100, name: 'Abyssal whip' }],
      },
    ]);
  });

  it('POST /methods/create rejects unsafe script content in method.description', async () => {
    await seedItems(100, 200, 4151, 4152);

    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    payload.description = '<script>alert(1)</script>';

    const res = await request(server).post('/methods/create').send(payload).expect(400);
    expectUnsafeMarkdownValidationMessage(res.body as { message?: unknown });
  });

  it('POST /methods/create rejects unsafe event handler content in variant.description', async () => {
    await seedItems(100, 200, 4151, 4152);

    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    payload.variants[0].description = '<img src=x onerror=alert(1)>';

    const res = await request(server).post('/methods/create').send(payload).expect(400);
    expectUnsafeMarkdownValidationMessage(res.body as { message?: unknown });
  });

  it('POST /methods/create rejects io quantities with too many decimal places', async () => {
    await seedItems(100, 200, 4151, 4152);

    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    payload.variants[0].inputs = [
      { id: 100, quantity: 1.1234567, type: 'input', reason: 'Reason text' },
    ];

    const res = await request(server).post('/methods/create').send(payload).expect(400);
    const body = res.body as { message?: unknown };
    const messages = Array.isArray(body.message)
      ? body.message.map(String)
      : [String(body.message)];

    expect(
      messages.some((message) =>
        message.includes('quantity must be a number conforming to the specified constraints'),
      ),
    ).toBe(true);
  });

  it('POST /methods/create rejects variants with more than 200 inputs', async () => {
    await seedItems(100, 200, 4151, 4152);

    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    payload.variants[0].inputs = Array.from({ length: 201 }, () => ({
      id: 100,
      quantity: 1,
      type: 'input' as const,
    }));

    const res = await request(server).post('/methods/create').send(payload).expect(400);
    const body = res.body as { message?: unknown };
    const messages = Array.isArray(body.message)
      ? body.message.map(String)
      : [String(body.message)];

    expect(
      messages.some((message) => message.includes('inputs must contain no more than 200 elements')),
    ).toBe(true);
  });

  it('POST /methods/create rejects requirements with more than 100 total entries', async () => {
    await seedItems(100, 200, 4151, 4152);

    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    payload.variants[0].requirements = {
      levels: Array.from({ length: 101 }, () => ({
        skill: 'magic',
        level: 1,
      })),
    };

    const res = await request(server).post('/methods/create').send(payload).expect(400);
    const body = res.body as { message?: unknown };
    const messages = Array.isArray(body.message)
      ? body.message.map(String)
      : [String(body.message)];

    expect(
      messages.some((message) =>
        message.includes('requirements must contain at most 100 total entries'),
      ),
    ).toBe(true);
  });

  it('PUT /methods/variant/:id rejects javascript: links in snapshotDescription', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);

    const savedMethod = await methodRepo.save(
      buildStoredMethodPayload({
        name: 'Snapshot method',
        slug: 'snapshot-method',
        description: 'Safe markdown',
        category: 'Skilling',
        enabled: true,
      }),
    );

    const savedVariant = await variantRepo.save({
      label: 'Snapshot variant',
      slug: 'snapshot-variant',
      description: null,
      xpHour: null,
      clickIntensity: 1,
      afkiness: 1,
      riskLevel: '1',
      requirements: null,
      recommendations: null,
      wilderness: false,
      actionsPerHour: 100,
      actionType: ActionType.ITEMS,
      method: savedMethod,
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .put(`/methods/variant/${savedVariant.id}?generateSnapshot=true`)
      .send({
        actionsPerHour: 100,
        actionType: ActionType.ITEMS,
        snapshotName: 'Snapshot title',
        snapshotDescription: '[x](javascript:alert(1))',
      })
      .expect(400);

    expectUnsafeMarkdownValidationMessage(res.body as { message?: unknown });
  });
});
