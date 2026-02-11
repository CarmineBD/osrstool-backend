import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Server } from 'http';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';
import { createPgMemAdapter } from './utils/pg-mem';
import { Skill } from '../src/catalog/entities/skill.entity';
import { Quest } from '../src/catalog/entities/quest.entity';
import { AchievementDiary } from '../src/catalog/entities/achievement-diary.entity';

jest.mock('pg', () => createPgMemAdapter());
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
  });

  beforeEach(async () => {
    await dataSource.getRepository(AchievementDiary).clear();
    await dataSource.getRepository(Quest).clear();
    await dataSource.getRepository(Skill).clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /skills -> 200 and array', async () => {
    const skillRepo = dataSource.getRepository(Skill);
    await skillRepo.save([
      { id: 1, name: 'Attack', key: 'attack' },
      { id: 2, name: 'Agility', key: 'agility' },
    ]);

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server).get('/skills').expect(200);

    const body = res.body as Array<{ id: number; name: string; key: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ id: 2, name: 'Agility', key: 'agility' });
    expect(body[1]).toEqual({ id: 1, name: 'Attack', key: 'attack' });
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('GET /quests?search=abc -> 200', async () => {
    const questRepo = dataSource.getRepository(Quest);
    await questRepo.save([
      { id: 1, name: "Cook's Assistant", slug: 'cooks-assistant' },
      { id: 2, name: 'Abc Trial', slug: 'abc-trial' },
    ]);

    const server = app.getHttpServer() as unknown as Server;
    const res = await request(server).get('/quests?search=abc').expect(200);

    const body = res.body as Array<{ id: number; name: string; slug: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([{ id: 2, name: 'Abc Trial', slug: 'abc-trial' }]);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('GET /achievement-diaries -> 200', async () => {
    const achievementDiaryRepo = dataSource.getRepository(AchievementDiary);
    await achievementDiaryRepo.save([
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

    const body = res.body as Array<{
      id: number;
      area: string;
      tier: string;
      name: string;
      slug: string;
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      id: 1,
      area: 'Ardougne',
      tier: 'Easy',
      name: 'Ardougne Easy Diary',
      slug: 'ardougne-easy-diary',
    });
    expect(body[1]).toEqual({
      id: 2,
      area: 'Desert',
      tier: 'Medium',
      name: 'Desert Medium Diary',
      slug: 'desert-medium-diary',
    });
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });
});
