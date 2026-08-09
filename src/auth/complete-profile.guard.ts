import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { createAccountUsernameRequiredException } from './account-username-required.exception';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class CompleteProfileGuard implements CanActivate {
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

    if (!user.accountUsername) {
      throw createAccountUsernameRequiredException();
    }

    return true;
  }
}
