import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { MethodsModule } from './methods/methods.module';
import { MethodProfitRefresherModule } from './method-profit-refresher/method-profit-refresher.module';
// Si tienes un PricesModule que se conecta a Redis, impórtalo también aquí:
import { PricesModule } from './prices/prices.module';
import { VariantHistoryModule } from './variant-history/variant-history.module';
import { VariantSnapshotModule } from './variant-snapshots/variant-snapshot.module';
import { ItemsModule } from './items/items.module';
import { SystemModule } from './system/system.module';

const validateEnv = (config: Record<string, string | undefined>) => {
  const hasDatabaseUrl = Boolean(config.DATABASE_URL && config.DATABASE_URL.trim().length > 0);
  const required = ['REDIS_URL'];
  const requiredDb = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME'];
  const missing = required.filter((key) => {
    const value = config[key];
    return !value || value.trim().length === 0;
  });
  const missingDb = hasDatabaseUrl
    ? []
    : requiredDb.filter((key) => {
        const value = config[key];
        return !value || value.trim().length === 0;
      });

  if (missing.length > 0 || missingDb.length > 0) {
    const missingKeys = [...missing, ...missingDb];
    throw new Error(
      `Missing required environment variables: ${missingKeys.join(', ')}. Check your .env file.`,
    );
  }

  if (!hasDatabaseUrl) {
    const portValue = config.DB_PORT?.trim();
    if (portValue && Number.isNaN(Number(portValue))) {
      throw new Error(`DB_PORT must be a number. Received "${config.DB_PORT}".`);
    }
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
      useFactory: (cfg: ConfigService) => {
        const databaseUrl = cfg.get<string>('DATABASE_URL');
        const base = databaseUrl
          ? { url: databaseUrl }
          : {
              host: cfg.get<string>('DB_HOST'),
              port: Number(cfg.get<string>('DB_PORT')),
              username: cfg.get<string>('DB_USER'),
              password: cfg.get<string>('DB_PASS'),
              database: cfg.get<string>('DB_NAME'),
            };

        return {
          type: 'postgres',
          ...base,
          entities: [__dirname + '/**/*.entity.{ts,js}'],
          synchronize: false,
        };
      },
    }),

    // Scheduler global:
    ScheduleModule.forRoot(),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const ttlValue = Number(cfg.get<string>('RATE_LIMIT_TTL_SECONDS') ?? 60);
        const limitValue = Number(cfg.get<string>('RATE_LIMIT_LIMIT') ?? 60);
        const ttl = Number.isFinite(ttlValue) && ttlValue > 0 ? ttlValue : 60;
        const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 60;
        return {
          throttlers: [{ ttl, limit }],
        };
      },
    }),

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
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
