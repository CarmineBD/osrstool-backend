import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CompleteProfileGuard } from './complete-profile.guard';
import { OptionalSupabaseAuthGuard } from './optional-supabase-auth.guard';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { TermsAcceptanceGuard } from './terms-acceptance.guard';
import { User } from './entities/user.entity';
import { UserTermsAcceptance } from './entities/user-terms-acceptance.entity';
import { MethodVariant } from '../methods/entities/variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, MethodVariant, UserTermsAcceptance])],
  controllers: [AuthController],
  providers: [
    SupabaseAuthGuard,
    OptionalSupabaseAuthGuard,
    TermsAcceptanceGuard,
    CompleteProfileGuard,
    SuperAdminGuard,
    AuthService,
  ],
  exports: [
    SupabaseAuthGuard,
    OptionalSupabaseAuthGuard,
    TermsAcceptanceGuard,
    CompleteProfileGuard,
    SuperAdminGuard,
    AuthService,
  ],
})
export class AuthModule {}
