import { HttpException } from '@nestjs/common';
import { PlayerInfoRateLimitGuard } from './player-info-rate-limit.guard';
import type { RedisService } from '../redis/redis.service';

describe('PlayerInfoRateLimitGuard', () => {
  const createContext = () =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'account-user-id' } }),
      }),
    }) as never;

  it('increments and sets expiry in one Redis script', async () => {
    const evalMock = jest.fn().mockResolvedValue(1);
    const redisService = { getClient: () => ({ eval: evalMock }) } as unknown as RedisService;
    const guard = new PlayerInfoRateLimitGuard(redisService);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);

    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('TTL', KEYS[1])"),
      1,
      'rate-limit:player-info:account-user-id',
      '60',
    );
  });

  it('rejects the third request in the one-minute window', async () => {
    const evalMock = jest.fn().mockResolvedValue(3);
    const redisService = { getClient: () => ({ eval: evalMock }) } as unknown as RedisService;
    const guard = new PlayerInfoRateLimitGuard(redisService);

    try {
      await guard.canActivate(createContext());
      fail('Expected the third request to be rate limited');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });
});
