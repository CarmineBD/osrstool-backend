import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { PricesModule } from '../prices/prices.module';
import { AuthModule } from '../auth/auth.module';
import { Item } from './entities/item.entity';
import { User } from '../auth/entities/user.entity';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { ItemsSeederService } from './items-seeder.service';

@Module({
  imports: [TypeOrmModule.forFeature([Item, User]), HttpModule, PricesModule, AuthModule],
  providers: [ItemsService, ItemsSeederService],
  controllers: [ItemsController],
  exports: [ItemsService, ItemsSeederService],
})
export class ItemsModule {}
