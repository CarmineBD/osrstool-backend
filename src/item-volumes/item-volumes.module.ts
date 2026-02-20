import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemVolumesService } from './item-volumes.service';
import { ItemVolumeBucket } from './entities/item-volume-bucket.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([ItemVolumeBucket])],
  providers: [ItemVolumesService],
  exports: [ItemVolumesService],
})
export class ItemVolumesModule {}
