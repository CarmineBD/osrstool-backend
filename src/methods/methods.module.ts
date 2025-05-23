// src/methods/methods.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MethodsService } from './methods.service';
import { MethodsController } from './methods.controller';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { RuneScapeApiService } from './RuneScapeApiService';

@Module({
  imports: [TypeOrmModule.forFeature([Method, MethodVariant, VariantIoItem])],
  providers: [MethodsService, RuneScapeApiService],
  controllers: [MethodsController],
  exports: [MethodsService], // ← añade esta línea
})
export class MethodsModule {}
