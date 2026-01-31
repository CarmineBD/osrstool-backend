import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MethodsModule } from './methods/methods.module';
import { MethodProfitRefresherModule } from './method-profit-refresher/method-profit-refresher.module';
// Si tienes un PricesModule que se conecta a Redis, impórtalo también aquí:
import { PricesModule } from './prices/prices.module';
import { VariantHistoryModule } from './variant-history/variant-history.module';
import { VariantSnapshotModule } from './variant-snapshots/variant-snapshot.module';
import { ItemsModule } from './items/items.module';
import { SystemModule } from './system/system.module';

const validateEnv = (config: Record<string, string | undefined>) => {
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'REDIS_URL'];
  const missing = required.filter((key) => {
    const value = config[key];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Check your .env file.`,
    );
  }

  const portValue = config.DB_PORT?.trim();
  if (portValue && Number.isNaN(Number(portValue))) {
    throw new Error(`DB_PORT must be a number. Received "${config.DB_PORT}".`);
  }

  const appPortValue = config.PORT?.trim();
  if (appPortValue && Number.isNaN(Number(appPortValue))) {
    throw new Error(`PORT must be a number. Received "${config.PORT}".`);
  }

  return config;
};

@Module({
  imports: [
    // 1 sola vez, antes de todo lo que inyecte ConfigService:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),

    // 1 sola vez, configuración de TypeORM:
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('DB_HOST'),
        port: cfg.get<number>('DB_PORT'),
        username: cfg.get<string>('DB_USER'),
        password: cfg.get<string>('DB_PASS'),
        database: cfg.get<string>('DB_NAME'),
        entities: [__dirname + '/**/*.entity.{ts,js}'],
        synchronize: false,
      }),
    }),

    // Scheduler global:
    ScheduleModule.forRoot(),

    // Tu módulo de métodos (abstrae CRUD):
    MethodsModule,

    // Módulo que refresca beneficios cada minuto:
    MethodProfitRefresherModule,

    // Guardar historial de profits cada 5 minutos:
    VariantHistoryModule,
    VariantSnapshotModule,

    // Si antes tenías un PricesModule para Redis, vuelve a importarlo:
    PricesModule,
    ItemsModule,
    SystemModule,
  ],
})
export class AppModule {}
