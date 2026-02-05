// src/prices/prices.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricesService } from './prices.service';
import { ItemPriceRule } from './entities/item-price-rule.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([ItemPriceRule])],
  providers: [PricesService],
  exports: [PricesService],
})
export class PricesModule {}
