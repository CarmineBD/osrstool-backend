import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';
import { VariantSnapshotsService } from './variant-snapshots.service';
import { VariantSnapshotsController } from './variant-snapshots.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VariantSnapshot])],
  providers: [VariantSnapshotsService],
  controllers: [VariantSnapshotsController],
})
export class VariantSnapshotsModule {}
