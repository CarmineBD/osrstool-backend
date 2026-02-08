import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, SuperAdminGuard, AuthService],
  exports: [SupabaseAuthGuard, SuperAdminGuard],
})
export class AuthModule {}
