import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MethodsModule } from './methods/methods.module';
import { MethodProfitRefresherModule } from './method-profit-refresher/method-profit-refresher.module';
// Si tienes un PricesModule que se conecta a Redis, impórtalo también aquí:
import { PricesModule } from './prices/prices.module';
import { VariantHistoryModule } from './variant-history/variant-history.module';

@Module({
  imports: [
    // 1 sola vez, antes de todo lo que inyecte ConfigService:
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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

    // Si antes tenías un PricesModule para Redis, vuelve a importarlo:
    PricesModule,
  ],
})
export class AppModule {}
