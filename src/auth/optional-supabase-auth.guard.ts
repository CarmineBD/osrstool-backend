import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Injectable()
export class OptionalSupabaseAuthGuard extends SupabaseAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.headers.authorization) {
      return true;
    }

    return super.canActivate(context);
  }
}
