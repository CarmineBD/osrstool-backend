import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Server } from 'http';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../src/catalog/catalog.module';
import { Skill } from '../src/catalog/entities/skill.entity';
import { Quest } from '../src/catalog/entities/quest.entity';
import { AchievementDiary } from '../src/catalog/entities/achievement-diary.entity';
import { createPgMemAdapter } from './utils/pg-mem';

jest.mock('pg', () => createPgMemAdapter());

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'test',
          password: 'test',
          database: `test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          entities: [Skill, Quest, AchievementDiary],
          synchronize: true,
          logging: false,
        }),
        CatalogModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.getRepository(AchievementDiary).clear();
    await dataSource.getRepository(Quest).clear();
    await dataSource.getRepository(Skill).clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /skills -> 200 y array', async () => {
    await dataSource.getRepository(Skill).save([
      { id: 1, name: 'Attack', key: 'attack' },
      { id: 2, name: 'Agility', key: 'agility' },
    ]);

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server).get('/skills').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([
      { id: 2, name: 'Agility', key: 'agility' },
      { id: 1, name: 'Attack', key: 'attack' },
    ]);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('GET /quests?search=abc -> 200', async () => {
    await dataSource.getRepository(Quest).save([
      { id: 1, name: "Cook's Assistant", slug: 'cooks-assistant' },
      { id: 2, name: 'Abc Trial', slug: 'abc-trial' },
    ]);

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server).get('/quests?search=abc').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([{ id: 2, name: 'Abc Trial', slug: 'abc-trial' }]);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('GET /achievement-diaries -> 200', async () => {
    await dataSource.getRepository(AchievementDiary).save([
      {
        id: 1,
        area: 'Ardougne',
        tier: 'Easy',
        name: 'Ardougne Easy Diary',
        slug: 'ardougne-easy-diary',
      },
      {
        id: 2,
        area: 'Desert',
        tier: 'Medium',
        name: 'Desert Medium Diary',
        slug: 'desert-medium-diary',
      },
    ]);

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server).get('/achievement-diaries').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([
      {
        id: 1,
        area: 'Ardougne',
        tier: 'Easy',
        name: 'Ardougne Easy Diary',
        slug: 'ardougne-easy-diary',
      },
      {
        id: 2,
        area: 'Desert',
        tier: 'Medium',
        name: 'Desert Medium Diary',
        slug: 'desert-medium-diary',
      },
    ]);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });
});
