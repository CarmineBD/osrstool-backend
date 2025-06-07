import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantHistory } from '../methods/entities/variant-history.entity';
import { VariantHistoryService } from './variant-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([VariantHistory])],
  providers: [VariantHistoryService],
})
export class VariantHistoryModule {}
