import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OptionalSupabaseAuthGuard } from './optional-supabase-auth.guard';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { User } from './entities/user.entity';
import { MethodVariant } from '../methods/entities/variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, MethodVariant])],
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, OptionalSupabaseAuthGuard, SuperAdminGuard, AuthService],
  exports: [SupabaseAuthGuard, OptionalSupabaseAuthGuard, SuperAdminGuard, AuthService],
})
export class AuthModule {}
