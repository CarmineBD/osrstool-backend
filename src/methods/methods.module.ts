// src/methods/methods.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MethodsService } from './methods.service';
import { MethodsController } from './methods.controller';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { VariantHistory } from './entities/variant-history.entity';
import { RuneScapeApiService } from './RuneScapeApiService';
import { PlayerController } from './player.controller';
import { PlayerInfoRateLimitGuard } from './player-info-rate-limit.guard';
import { VariantSnapshotModule } from '../variant-snapshots/variant-snapshot.module';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { Item } from '../items/entities/item.entity';
import { IconsModule } from '../icons/icons.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Method, MethodVariant, VariantIoItem, VariantHistory, User, Item]),
    VariantSnapshotModule,
    AuthModule,
    IconsModule,
  ],
  providers: [MethodsService, RuneScapeApiService, PlayerInfoRateLimitGuard],
  controllers: [MethodsController, PlayerController],
  exports: [MethodsService], // â† aÃ±ade esta lÃ­nea
})
export class MethodsModule {}
