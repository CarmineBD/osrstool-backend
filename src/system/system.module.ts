import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { HealthService } from './health.service';
import { SystemController } from './system.controller';
import { VersionService } from './version.service';

@Module({
  imports: [ConfigModule, TypeOrmModule],
  controllers: [SystemController],
  providers: [HealthService, VersionService],
})
export class SystemModule {}
