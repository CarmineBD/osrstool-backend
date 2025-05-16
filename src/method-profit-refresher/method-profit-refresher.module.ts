import { Module } from '@nestjs/common';
import { MethodProfitRefresherService } from './method-profit-refresher.service';
import { MethodsModule } from '../methods/methods.module';
import { PricesModule } from '../prices/prices.module';

@Module({
  imports: [MethodsModule, PricesModule],
  providers: [MethodProfitRefresherService],
})
export class MethodProfitRefresherModule {}
