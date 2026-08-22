import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { GameIcon } from './entities/game-icon.entity';
import { IconsController } from './icons.controller';
import { IconResolverService } from './icon-resolver.service';
import { IconsService } from './icons.service';

@Module({
  imports: [TypeOrmModule.forFeature([Item, GameIcon])],
  controllers: [IconsController],
  providers: [IconResolverService, IconsService],
  exports: [IconResolverService],
})
export class IconsModule {}
