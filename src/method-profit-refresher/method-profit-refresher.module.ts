// src/method-profit-refresher/method-profit-refresher.module.ts
import { Module } from '@nestjs/common';
import { MethodsModule } from '../methods/methods.module';
import { PricesModule } from '../prices/prices.module';
import { MethodProfitRefresherService } from './method-profit-refresher.service';

@Module({
  imports: [MethodsModule, PricesModule],
  providers: [MethodProfitRefresherService],
})
export class MethodProfitRefresherModule {}
