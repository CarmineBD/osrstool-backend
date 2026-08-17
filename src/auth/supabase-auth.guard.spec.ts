jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { RedisService } from '../redis/redis.service';
import { buildDeletedUserAuthKey } from './deleted-user-auth.util';
import { SupabaseAuthGuard } from './supabase-auth.guard';

function createHttpExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('SupabaseAuthGuard', () => {
  let guard: SupabaseAuthGuard;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let redisClient: { get: jest.Mock };
  let redisService: jest.Mocked<Pick<RedisService, 'getClient'>>;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'SUPABASE_PROJECT_URL':
            return 'https://example.supabase.co';
          case 'SUPABASE_JWT_AUD':
            return 'authenticated';
          default:
            return undefined;
        }
      }),
    };
    redisClient = {
      get: jest.fn().mockResolvedValue(null),
    };
    redisService = {
      getClient: jest.fn().mockReturnValue(redisClient),
    };
    (createRemoteJWKSet as jest.Mock).mockReturnValue('jwks');
    (jwtVerify as jest.Mock).mockResolvedValue({
      payload: {
        sub: 'user-1',
        email: 'user@example.com',
        role: 'authenticated',
      },
    });

    guard = new SupabaseAuthGuard(
      configService as unknown as ConfigService,
      redisService as unknown as RedisService,
    );
  });

  it('attaches the authenticated user to the request', async () => {
    const request = {
      headers: {
        authorization: 'Bearer token',
      },
    };

    await expect(guard.canActivate(createHttpExecutionContext(request))).resolves.toBe(true);

    expect(redisClient.get).toHaveBeenCalledWith(buildDeletedUserAuthKey('user-1'));
    expect(request).toMatchObject({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: 'authenticated',
      },
    });
  });

  it('rejects access for users deleted in the current token window', async () => {
    redisClient.get.mockResolvedValue('1');
    const request = {
      headers: {
        authorization: 'Bearer token',
      },
    };

    await expect(guard.canActivate(createHttpExecutionContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
