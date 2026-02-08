import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthenticatedUser } from './auth.types';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = req.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Invalid Authorization header format. Expected: Bearer <token>',
      );
    }

    const projectUrlRaw = this.configService.get<string>('SUPABASE_PROJECT_URL');
    if (!projectUrlRaw || projectUrlRaw.trim().length === 0) {
      throw new UnauthorizedException('Server auth configuration is missing');
    }

    const projectUrl = projectUrlRaw.replace(/\/+$/, '');
    let jwksUrl: URL;
    try {
      jwksUrl = new URL(`${projectUrl}/auth/v1/.well-known/jwks.json`);
    } catch {
      throw new UnauthorizedException('Invalid Supabase project URL configuration');
    }

    const issuer = `${projectUrl}/auth/v1`;
    const audience = this.configService.get<string>('SUPABASE_JWT_AUD')?.trim();
    const jwks = createRemoteJWKSet(jwksUrl);

    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(token, jwks, {
        issuer,
        audience: audience && audience.length > 0 ? audience : undefined,
      });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const subject = payload.sub;
    if (!subject || typeof subject !== 'string') {
      throw new UnauthorizedException('Authenticated token does not include user id');
    }

    req.user = {
      id: subject,
      email: typeof payload.email === 'string' ? payload.email : null,
      role: typeof payload.role === 'string' ? payload.role : undefined,
      ...payload,
    };

    return true;
  }
}
