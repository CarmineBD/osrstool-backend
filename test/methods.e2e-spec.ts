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
import { buildMethodFixture } from '../src/testing/fixtures';
import { Method } from '../src/methods/entities/method.entity';
import { MethodVariant } from '../src/methods/entities/variant.entity';
import { VariantIoItem } from '../src/methods/entities/io-item.entity';
import { createPgMemAdapter } from './utils/pg-mem';

jest.mock('pg', () => createPgMemAdapter());

describe('Methods (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const expectUnsafeMarkdownValidationMessage = (body: { message?: unknown }): void => {
    const messages = Array.isArray(body.message)
      ? body.message.map(String)
      : [String(body.message)];
    expect(
      messages.some((message) => message.includes('must not contain unsafe markdown/html content')),
    ).toBe(true);
  };

  const buildValidCreateMethodPayload = () => ({
    name: 'Validated method',
    description: 'Texto **markdown** con [link](https://example.com)',
    category: 'Skilling',
    enabled: true,
    variants: [
      {
        label: 'Validated variant',
        description: 'Lista:\n- item 1\n- item 2',
        inputs: [{ id: 100, quantity: 1, type: 'input', reason: 'Reason text' }],
        outputs: [{ id: 200, quantity: 1, type: 'output', reason: 'Reason text' }],
      },
    ],
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
    redisCall.mockReset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /methods returns best variant and variantCount', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);
    const ioRepo = dataSource.getRepository(VariantIoItem);
    const seed = buildMethodFixture();

    const savedMethod = await methodRepo.save({
      name: seed.name,
      slug: seed.slug,
      description: seed.description,
      category: seed.category,
    });

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
    const profitPayload = [
      {
        [savedMethod.id]: {
          [variantIds[0]]: { low: 100, high: 200 },
          [variantIds[1]]: { low: 50, high: 300 },
        },
      },
    ];

    redisCall.mockResolvedValue(JSON.stringify(profitPayload));

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server).get('/methods').expect(200);

    const body = res.body as {
      status: string;
      data: { methods: Array<{ variantCount: number; variants: Array<{ id: string }> }> };
    };
    expect(body.status).toBe('ok');
    expect(body.data.methods).toHaveLength(1);
    const result = body.data.methods[0];
    expect(result.variantCount).toBe(2);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].id).toBe(variantIds[1]);
  });

  it('POST /methods rejects unsafe script content in method.description', async () => {
    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    payload.description = '<script>alert(1)</script>';

    const res = await request(server).post('/methods').send(payload).expect(400);
    expectUnsafeMarkdownValidationMessage(res.body as { message?: unknown });
  });

  it('POST /methods rejects unsafe event handler content in variant.description', async () => {
    const server = app.getHttpServer() as unknown as Server;
    const payload = buildValidCreateMethodPayload();
    payload.variants[0].description = '<img src=x onerror=alert(1)>';

    const res = await request(server).post('/methods').send(payload).expect(400);
    expectUnsafeMarkdownValidationMessage(res.body as { message?: unknown });
  });

  it('PUT /methods/variant/:id rejects javascript: links in snapshotDescription', async () => {
    const methodRepo = dataSource.getRepository(Method);
    const variantRepo = dataSource.getRepository(MethodVariant);

    const savedMethod = await methodRepo.save({
      name: 'Snapshot method',
      slug: 'snapshot-method',
      description: 'Safe markdown',
      category: 'Skilling',
      enabled: true,
    });

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
      method: savedMethod,
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .put(`/methods/variant/${savedVariant.id}?generateSnapshot=true`)
      .send({
        snapshotName: 'Snapshot title',
        snapshotDescription: '[x](javascript:alert(1))',
      })
      .expect(400);

    expectUnsafeMarkdownValidationMessage(res.body as { message?: unknown });
  });
});
