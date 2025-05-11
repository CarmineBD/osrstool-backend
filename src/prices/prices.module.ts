// src/prices/prices.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PricesService } from './prices.service';

@Module({
  imports: [HttpModule],
  providers: [PricesService],
  exports: [PricesService],
})
export class PricesModule {}
