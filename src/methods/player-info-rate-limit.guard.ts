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

const INCREMENT_WITH_EXPIRY_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if redis.call('TTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

@Injectable()
export class PlayerInfoRateLimitGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id;
    if (!userId) return false;

    const key = `rate-limit:player-info:${userId}`;
    const count = Number(
      await this.redisService.getClient().eval(INCREMENT_WITH_EXPIRY_SCRIPT, 1, key, '60'),
    );
    if (count > 2) {
      throw new HttpException(
        'Player info requests are limited to 2 per minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
