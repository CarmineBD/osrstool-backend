import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { PricesModule } from '../prices/prices.module';
import { Item } from './entities/item.entity';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { ItemsSeederService } from './items-seeder.service';

@Module({
  imports: [TypeOrmModule.forFeature([Item]), HttpModule, PricesModule],
  providers: [ItemsService, ItemsSeederService],
  controllers: [ItemsController],
  exports: [ItemsService, ItemsSeederService],
})
export class ItemsModule {}
