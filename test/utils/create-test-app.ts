import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

  const moduleFixture = await Test.createTestingModule({
    imports: [
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
        ],
        synchronize: true,
        logging: false,
      }),
      MethodsModule,
      ItemsModule,
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
