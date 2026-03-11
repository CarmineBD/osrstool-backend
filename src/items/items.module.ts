import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { PricesModule } from '../prices/prices.module';
import { ItemVolumesModule } from '../item-volumes/item-volumes.module';
import { AuthModule } from '../auth/auth.module';
import { Item } from './entities/item.entity';
import { User } from '../auth/entities/user.entity';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { ItemsSeederService } from './items-seeder.service';
import { ItemsMappingSyncService } from './items-mapping-sync.service';
import { ItemsWikiSyncService } from './items-wiki-sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Item, User]),
    HttpModule,
    PricesModule,
    ItemVolumesModule,
    AuthModule,
  ],
  providers: [ItemsService, ItemsSeederService, ItemsMappingSyncService, ItemsWikiSyncService],
  controllers: [ItemsController],
  exports: [ItemsService, ItemsSeederService, ItemsMappingSyncService, ItemsWikiSyncService],
})
export class ItemsModule {}
