import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { createTermsAcceptanceRequiredException } from './terms-acceptance-required.exception';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class TermsAcceptanceGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const authUser = req.user;

    if (!authUser?.id) {
      throw new UnauthorizedException('Missing authenticated user context');
    }

    const user = await this.authService.getOrCreateUser({
      id: authUser.id,
      email: authUser.email,
    });
    const termsStatus = await this.authService.getCurrentTermsStatusForUser(user.id);

    if (!termsStatus.accepted) {
      throw createTermsAcceptanceRequiredException(termsStatus.currentVersion);
    }

    return true;
  }
}
