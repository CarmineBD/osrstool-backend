import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Server } from 'http';
import { DataSource } from 'typeorm';
import { createTestApp, TestApp } from './utils/create-test-app';
import { buildItemFixture } from '../src/testing/fixtures';
import { Item } from '../src/items/entities/item.entity';
import { createPgMemAdapter } from './utils/pg-mem';

jest.mock('pg', () => createPgMemAdapter());

describe('Items (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let pricesService: TestApp['pricesService'];

  beforeEach(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
    pricesService = testApp.pricesService;
    pricesService.getMany.mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /items?ids returns filtered fields and prices', async () => {
    const itemRepo = dataSource.getRepository(Item);
    const item = buildItemFixture();
    await itemRepo.save(item);

    pricesService.getMany.mockResolvedValue({
      [item.id]: { high: 200, low: 150, highTime: 1, lowTime: 2 },
    });

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server)
      .get(`/items?ids=${item.id}&fields=id,name,iconUrl,highPrice,lowPrice`)
      .expect(200);

    const body = res.body as Record<
      number,
      {
        id: number;
        name: string;
        iconUrl: string;
        highPrice?: number;
        lowPrice?: number;
        highTime?: number;
      }
    >;
    const itemBody = body[item.id];
    expect(itemBody.id).toBe(item.id);
    expect(itemBody.name).toBe(item.name);
    expect(itemBody.iconUrl).toContain('Abyssal_whip_%28p%29.png');
    expect(itemBody.highPrice).toBe(200);
    expect(itemBody.lowPrice).toBe(150);
    expect(itemBody.highTime).toBeUndefined();
  });
});
