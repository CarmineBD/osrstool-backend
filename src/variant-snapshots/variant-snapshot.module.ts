import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VariantSnapshot } from '../methods/entities/variant-snapshot.entity';
import { VariantIoItemSnapshot } from '../methods/entities/io-item-snapshot.entity';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { VariantSnapshotService } from './variant-snapshot.service';
import { VariantSnapshotController } from './variant-snapshot.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VariantSnapshot, VariantIoItemSnapshot, User]), AuthModule],
  providers: [VariantSnapshotService],
  controllers: [VariantSnapshotController],
  exports: [VariantSnapshotService],
})
export class VariantSnapshotModule {}
