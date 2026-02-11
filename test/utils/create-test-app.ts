import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ItemsModule } from '../../src/items/items.module';
import { MethodsModule } from '../../src/methods/methods.module';
import { CatalogModule } from '../../src/catalog/catalog.module';
import { PricesService } from '../../src/prices/prices.service';
import { Item } from '../../src/items/entities/item.entity';
import { Method } from '../../src/methods/entities/method.entity';
import { MethodVariant } from '../../src/methods/entities/variant.entity';
import { VariantIoItem } from '../../src/methods/entities/io-item.entity';
import { VariantHistory } from '../../src/methods/entities/variant-history.entity';
import { VariantSnapshot } from '../../src/methods/entities/variant-snapshot.entity';
import { VariantIoItemSnapshot } from '../../src/methods/entities/io-item-snapshot.entity';
import { User } from '../../src/auth/entities/user.entity';
import { MethodLike } from '../../src/methods/entities/method-like.entity';
import { Skill } from '../../src/catalog/entities/skill.entity';
import { Quest } from '../../src/catalog/entities/quest.entity';
import { AchievementDiary } from '../../src/catalog/entities/achievement-diary.entity';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  pricesService: {
    getMany: jest.MockedFunction<PricesService['getMany']>;
  };
}

export const createTestApp = async (): Promise<TestApp> => {
  const pricesService: TestApp['pricesService'] = {
    getMany: jest.fn(),
  };
  const database = `test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const moduleFixture = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            SUPABASE_PROJECT_URL: 'https://example.supabase.co',
          }),
        ],
      }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'test',
        password: 'test',
        database,
        entities: [
          Item,
          Method,
          MethodVariant,
          VariantIoItem,
          VariantHistory,
          VariantSnapshot,
          VariantIoItemSnapshot,
          User,
          MethodLike,
          Skill,
          Quest,
          AchievementDiary,
        ],
        synchronize: true,
        logging: false,
      }),
      MethodsModule,
      ItemsModule,
      CatalogModule,
    ],
  })
    .overrideProvider(PricesService)
    .useValue(pricesService)
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  const dataSource = app.get(DataSource);

  return { app, dataSource, pricesService };
};
