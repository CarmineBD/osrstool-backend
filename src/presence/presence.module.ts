import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PresenceController } from './presence.controller';
import { PresenceHistory } from './entities/presence-history.entity';
import { PresenceService } from './presence.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([PresenceHistory])],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
