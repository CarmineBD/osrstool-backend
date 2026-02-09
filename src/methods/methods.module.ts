// src/methods/methods.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MethodsService } from './methods.service';
import { MethodsController } from './methods.controller';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { VariantHistory } from './entities/variant-history.entity';
import { MethodLike } from './entities/method-like.entity';
import { RuneScapeApiService } from './RuneScapeApiService';
import { VariantSnapshotModule } from '../variant-snapshots/variant-snapshot.module';
import { User } from '../auth/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Method,
      MethodVariant,
      VariantIoItem,
      VariantHistory,
      MethodLike,
      User,
    ]),
    VariantSnapshotModule,
    AuthModule,
  ],
  providers: [MethodsService, RuneScapeApiService],
  controllers: [MethodsController],
  exports: [MethodsService], // ← añade esta línea
})
export class MethodsModule {}
