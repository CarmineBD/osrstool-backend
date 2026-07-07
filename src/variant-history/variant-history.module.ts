import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantHistory } from '../methods/entities/variant-history.entity';
import { VariantHistoryDaily } from '../methods/entities/variant-history-daily.entity';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';
import { VariantHistoryService } from './variant-history.service';
import { VariantHistoryController } from './variant-history.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VariantHistory, VariantHistoryDaily, VariantSnapshot])],
  providers: [VariantHistoryService],
  controllers: [VariantHistoryController],
})
export class VariantHistoryModule {}
