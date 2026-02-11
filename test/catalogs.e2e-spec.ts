import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Server } from 'http';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';
import { createPgMemAdapter } from './utils/pg-mem';
import { AchievementDiary } from '../src/catalogs/entities/achievement-diary.entity';
import { Quest } from '../src/catalogs/entities/quest.entity';
import { Skill } from '../src/catalogs/entities/skill.entity';

jest.mock('pg', () => createPgMemAdapter());

describe('Catalogs (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeEach(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET catalogs endpoints return empty arrays when there are no rows', async () => {
    const server = app.getHttpServer() as unknown as Server;

    const achievementDiariesRes = await request(server).get('/achievement-diaries').expect(200);
    expect(achievementDiariesRes.body).toEqual([]);

    const questsRes = await request(server).get('/quests').expect(200);
    expect(questsRes.body).toEqual([]);

    const skillsRes = await request(server).get('/skills').expect(200);
    expect(skillsRes.body).toEqual([]);
  });

  it('GET catalogs endpoints return selected fields', async () => {
    const achievementDiaryRepo = dataSource.getRepository(AchievementDiary);
    const questRepo = dataSource.getRepository(Quest);
    const skillRepo = dataSource.getRepository(Skill);

    await achievementDiaryRepo.save({ id: 10, region: 'Varrock', tier: 'medium' });
    await questRepo.save({ id: 20, name: "Doric's Quest", slug: 'dorics-quest' });
    await skillRepo.save({ id: 30, name: 'Magic', key: 'magic' });

    const server = app.getHttpServer() as unknown as Server;

    const achievementDiariesRes = await request(server).get('/achievement-diaries').expect(200);
    expect(achievementDiariesRes.body).toEqual([{ id: 10, region: 'Varrock', tier: 'medium' }]);

    const questsRes = await request(server).get('/quests').expect(200);
    expect(questsRes.body).toEqual([{ id: 20, name: "Doric's Quest", slug: 'dorics-quest' }]);

    const skillsRes = await request(server).get('/skills').expect(200);
    expect(skillsRes.body).toEqual([{ id: 30, name: 'Magic', key: 'magic' }]);
  });
});
