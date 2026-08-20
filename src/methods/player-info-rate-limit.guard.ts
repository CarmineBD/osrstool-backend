import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RedisService } from '../redis/redis.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class PlayerInfoRateLimitGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id;
    if (!userId) return false;

    const key = `rate-limit:player-info:${userId}`;
    const count = await this.redisService.getClient().incr(key);
    if (count === 1) {
      await this.redisService.getClient().expire(key, 60);
    }
    if (count > 2) {
      throw new HttpException(
        'Player info requests are limited to 2 per minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
