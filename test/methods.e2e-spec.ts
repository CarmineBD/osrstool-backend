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

  beforeEach(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
    redisCall.mockReset();
  });

  afterEach(async () => {
    await app.close();
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
});
