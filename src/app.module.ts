// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MethodsModule } from './methods/methods.module';
import { PricesModule } from './prices/prices.module';
import { MethodProfitRefresherModule } from './method-profit-refresher/method-profit-refresher.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // activa @Cron, @Interval…
    MethodsModule,
    PricesModule,
    MethodProfitRefresherModule, // tu nuevo módulo
  ],
})
export class AppModule {}
