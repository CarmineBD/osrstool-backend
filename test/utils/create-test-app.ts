import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ItemsModule } from '../../src/items/items.module';
import { MethodsModule } from '../../src/methods/methods.module';
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
import { ItemVolumeBucket } from '../../src/item-volumes/entities/item-volume-bucket.entity';
import { CatalogsModule } from '../../src/catalogs/catalogs.module';
import { AchievementDiary } from '../../src/catalogs/entities/achievement-diary.entity';
import { Quest } from '../../src/catalogs/entities/quest.entity';
import { Skill } from '../../src/catalogs/entities/skill.entity';
import { SupabaseAuthGuard } from '../../src/auth/supabase-auth.guard';
import { SuperAdminGuard } from '../../src/auth/super-admin.guard';
import { ItemVolumesService } from '../../src/item-volumes/item-volumes.service';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  pricesService: {
    getMany: jest.MockedFunction<PricesService['getMany']>;
  };
  itemVolumesService: {
    getMany: jest.MockedFunction<ItemVolumesService['getMany']>;
  };
}

export const createTestApp = async (): Promise<TestApp> => {
  const pricesService: TestApp['pricesService'] = {
    getMany: jest.fn(),
  };
  const itemVolumesService: TestApp['itemVolumesService'] = {
    getMany: jest.fn(),
  };

  const moduleFixture = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            REDIS_URL: 'redis://localhost:6379',
            SUPABASE_PROJECT_URL: 'https://example.supabase.co',
            SUPABASE_JWT_AUD: 'authenticated',
          }),
        ],
      }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'test',
        password: 'test',
        database: 'test',
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
          ItemVolumeBucket,
          AchievementDiary,
          Quest,
          Skill,
        ],
        synchronize: true,
        logging: false,
      }),
      MethodsModule,
      ItemsModule,
      CatalogsModule,
    ],
  })
    .overrideProvider(PricesService)
    .useValue(pricesService)
    .overrideProvider(ItemVolumesService)
    .useValue(itemVolumesService)
    .overrideGuard(SupabaseAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(SuperAdminGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  const dataSource = app.get(DataSource);

  return { app, dataSource, pricesService, itemVolumesService };
};
