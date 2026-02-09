import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { User } from './entities/user.entity';
import { MethodLike } from '../methods/entities/method-like.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, MethodLike])],
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, SuperAdminGuard, AuthService],
  exports: [SupabaseAuthGuard, SuperAdminGuard, AuthService],
})
export class AuthModule {}
