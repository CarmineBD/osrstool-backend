import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { MethodVariant } from '../methods/entities/variant.entity';
import { AuthService } from './auth.service';
import { buildDeletedUserAuthKey } from './deleted-user-auth.util';
import { User } from './entities/user.entity';
import { UserTermsAcceptance } from './entities/user-terms-acceptance.entity';

type QueryManager = {
  query: jest.Mock;
};

type TransactionRunner = (callback: (entityManager: never) => Promise<unknown>) => Promise<unknown>;

describe('AuthService', () => {
  let service: AuthService;
  let repo: jest.Mocked<Pick<Repository<User>, 'findOne' | 'create' | 'save'>>;
  let likesRepo: jest.Mocked<Pick<Repository<MethodVariant>, 'createQueryBuilder'>>;
  let termsRepo: jest.Mocked<Pick<Repository<UserTermsAcceptance>, 'findOne' | 'create' | 'save'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let dataSource: { transaction: jest.MockedFunction<TransactionRunner> };
  let redisClient: { set: jest.Mock; del: jest.Mock; zrem: jest.Mock };
  let redisService: jest.Mocked<Pick<RedisService, 'getClient'>>;
  let likesQueryBuilder: {
    where: jest.Mock;
    getCount: jest.Mock;
  };
  const originalFetch = global.fetch;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    likesQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn(),
    };
    likesRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(likesQueryBuilder),
    };
    termsRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(),
    };
    redisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      zrem: jest.fn().mockResolvedValue(1),
    };
    redisService = {
      getClient: jest.fn().mockReturnValue(redisClient),
    };
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

    service = new AuthService(
      repo as unknown as Repository<User>,
      likesRepo as unknown as Repository<MethodVariant>,
      termsRepo as unknown as Repository<UserTermsAcceptance>,
      configService as unknown as ConfigService,
      dataSource as unknown as DataSource,
      redisService as unknown as RedisService,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a new user when it does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockReturnValue({
      id: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205',
      email: 'user@example.com',
      accountUsername: null,
      plan: 'free',
      role: 'user',
    } as User);
    repo.save.mockImplementation((value) => Promise.resolve(value as User));

    const result = await service.getOrCreateUser({
      id: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205',
      email: 'user@example.com',
    });

    expect(repo.create).toHaveBeenCalledWith({
      id: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205',
      email: 'user@example.com',
      accountUsername: null,
      plan: 'free',
      role: 'user',
    });
    expect(result.plan).toBe('free');
    expect(result.role).toBe('user');
  });

  it('returns existing user when email did not change', async () => {
    const existing = {
      id: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205',
      email: 'user@example.com',
      accountUsername: null,
      plan: 'free',
      role: 'user',
    } as User;
    repo.findOne.mockResolvedValue(existing);

    const result = await service.getOrCreateUser({
      id: existing.id,
      email: existing.email,
    });

    expect(repo.save).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('updates email when existing user has different email', async () => {
    const existing = {
      id: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205',
      email: 'old@example.com',
      accountUsername: null,
      plan: 'free',
      role: 'user',
    } as User;
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockImplementation((value) => Promise.resolve(value as User));

    const result = await service.getOrCreateUser({
      id: existing.id,
      email: 'new@example.com',
    });

    expect(repo.save).toHaveBeenCalled();
    expect(result.email).toBe('new@example.com');
  });

  it('returns number of likes given by user', async () => {
    likesQueryBuilder.getCount.mockResolvedValue(7);

    const likes = await service.getGivenLikesCount('a42cf41b-2e77-4478-aedf-6cb1f8bce205');

    expect(likesRepo.createQueryBuilder).toHaveBeenCalledWith('method_variant');
    expect(likesQueryBuilder.where).toHaveBeenCalledWith(
      ':userId = ANY(method_variant.liked_user_ids)',
      { userId: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205' },
    );
    expect(likes).toBe(7);
  });

  it('reports current terms as not accepted when there is no current acceptance', async () => {
    termsRepo.findOne.mockResolvedValue(null);

    await expect(service.getCurrentTermsStatusForUser('user-1')).resolves.toEqual({
      currentVersion: 'v1',
      accepted: false,
    });
  });

  it('reports current terms as accepted only when the current version exists', async () => {
    termsRepo.findOne.mockResolvedValue({
      id: 'acceptance-1',
      userId: 'user-1',
      termsVersion: 'v1',
    } as UserTermsAcceptance);

    await expect(service.getCurrentTermsStatusForUser('user-1')).resolves.toEqual({
      currentVersion: 'v1',
      accepted: true,
    });
  });

  it('normalizes and saves account username once', async () => {
    const existing = {
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: null,
      plan: 'free',
      role: 'user',
    } as User;
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockImplementation((value) => Promise.resolve(value as User));

    const result = await service.setAccountUsername(
      {
        id: 'user-1',
        email: 'user@example.com',
      },
      '  Account_User  ',
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ accountUsername: 'account_user' }),
    );
    expect(result.accountUsername).toBe('account_user');
  });

  it('rejects invalid account username format', async () => {
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: null,
    } as User);

    await expect(
      service.setAccountUsername(
        {
          id: 'user-1',
          email: 'user@example.com',
        },
        '_bad',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing account username', async () => {
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: null,
    } as User);

    await expect(
      service.setAccountUsername(
        {
          id: 'user-1',
          email: 'user@example.com',
        },
        undefined as unknown as string,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reserved account usernames', async () => {
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: null,
    } as User);

    await expect(
      service.setAccountUsername(
        {
          id: 'user-1',
          email: 'user@example.com',
        },
        'Admin',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when account username is already set for the current user', async () => {
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: 'existing_user',
    } as User);

    await expect(
      service.setAccountUsername(
        {
          id: 'user-1',
          email: 'user@example.com',
        },
        'new_user',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps unique violations to conflict for race-safe duplicate handling', async () => {
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: null,
    } as User);
    repo.save.mockRejectedValue({
      code: '23505',
      constraint: 'idx_users_account_username_unique_ci',
    });

    await expect(
      service.setAccountUsername(
        {
          id: 'user-1',
          email: 'user@example.com',
        },
        'account_user',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates the current terms acceptance once', async () => {
    const existing = {
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: null,
      plan: 'free',
      role: 'user',
    } as User;
    repo.findOne.mockResolvedValue(existing);
    termsRepo.findOne.mockResolvedValueOnce(null);
    termsRepo.create.mockReturnValue({
      userId: 'user-1',
      termsVersion: 'v1',
    } as UserTermsAcceptance);
    termsRepo.save.mockResolvedValue({
      id: 'acceptance-1',
      userId: 'user-1',
      termsVersion: 'v1',
    } as UserTermsAcceptance);

    await expect(
      service.acceptCurrentTerms({
        id: 'user-1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({
      currentVersion: 'v1',
      accepted: true,
    });

    expect(termsRepo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      termsVersion: 'v1',
    });
  });

  it('is idempotent when the current terms were already accepted', async () => {
    const existing = {
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: null,
      plan: 'free',
      role: 'user',
    } as User;
    repo.findOne.mockResolvedValue(existing);
    termsRepo.findOne.mockResolvedValue({
      id: 'acceptance-1',
      userId: 'user-1',
      termsVersion: 'v1',
    } as UserTermsAcceptance);

    await expect(
      service.acceptCurrentTerms({
        id: 'user-1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({
      currentVersion: 'v1',
      accepted: true,
    });

    expect(termsRepo.save).not.toHaveBeenCalled();
  });

  it('treats duplicate current-version inserts as a successful idempotent acceptance', async () => {
    const existing = {
      id: 'user-1',
      email: 'user@example.com',
      accountUsername: null,
      plan: 'free',
      role: 'user',
    } as User;
    repo.findOne.mockResolvedValue(existing);
    termsRepo.findOne.mockResolvedValueOnce(null);
    termsRepo.create.mockReturnValue({
      userId: 'user-1',
      termsVersion: 'v1',
    } as UserTermsAcceptance);
    termsRepo.save.mockRejectedValue({
      code: '23505',
      constraint: 'uq_user_terms_acceptances_user_version',
    });

    await expect(
      service.acceptCurrentTerms({
        id: 'user-1',
        email: 'user@example.com',
      }),
    ).resolves.toEqual({
      currentVersion: 'v1',
      accepted: true,
    });
  });

  it('deletes the authenticated user from Postgres and Supabase and marks the auth tombstone', async () => {
    const manager: QueryManager = {
      query: jest.fn().mockResolvedValue(undefined),
    };
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    const exp = Math.floor(Date.now() / 1000) + 7200;
    configService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'SUPABASE_PROJECT_URL':
          return 'https://example.supabase.co';
        case 'SUPABASE_SERVICE_ROLE_KEY':
          return 'service-role-key';
        case 'PRESENCE_REDIS_KEY':
          return 'presence:online';
        default:
          return undefined;
      }
    });
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: never) => Promise<unknown>) => callback(manager as never),
    );
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

    await expect(service.deleteAuthenticatedUser({ id: 'user-1', exp })).resolves.toBeUndefined();

    const queryCalls = manager.query.mock.calls as Array<[string, unknown[]]>;
    const fetchCalls = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls as Array<
      [RequestInfo | URL, RequestInit | undefined]
    >;

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(redisClient.set.mock.invocationCallOrder[0]).toBeLessThan(
      (global.fetch as jest.MockedFunction<typeof fetch>).mock.invocationCallOrder[0],
    );
    expect(
      (global.fetch as jest.MockedFunction<typeof fetch>).mock.invocationCallOrder[0],
    ).toBeLessThan(dataSource.transaction.mock.invocationCallOrder[0]);
    expect(queryCalls).toHaveLength(4);
    expect(String(queryCalls[0][0])).toContain('UPDATE method_variants');
    expect(queryCalls[0][1]).toEqual(['user-1']);
    expect(String(queryCalls[1][0])).toContain('UPDATE admin_script_executions');
    expect(String(queryCalls[2][0])).toContain('DELETE FROM public.user_terms_acceptances');
    expect(String(queryCalls[3][0])).toContain('DELETE FROM public.users');
    expect(fetchCalls[0]?.[0]).toBe('https://example.supabase.co/auth/v1/admin/users/user-1');
    expect(fetchCalls[0]?.[1]).toMatchObject({
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer service-role-key',
        apikey: 'service-role-key',
      },
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      buildDeletedUserAuthKey('user-1'),
      '1',
      'EX',
      expect.any(Number),
    );
    const redisSetCalls = redisClient.set.mock.calls as Array<[string, string, string, number]>;
    expect(redisSetCalls[0][3]).toBeGreaterThanOrEqual(7200);
    expect(redisClient.zrem).toHaveBeenCalledWith('presence:online', 'user:user-1');
  });

  it('fails fast when Supabase admin configuration is missing', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'SUPABASE_PROJECT_URL') {
        return 'https://example.supabase.co';
      }

      return undefined;
    });

    await expect(service.deleteAuthenticatedUser({ id: 'user-1' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('treats missing Supabase auth users as already deleted', async () => {
    const manager: QueryManager = {
      query: jest.fn().mockResolvedValue(undefined),
    };
    configService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'SUPABASE_PROJECT_URL':
          return 'https://example.supabase.co';
        case 'SUPABASE_SERVICE_ROLE_KEY':
          return 'service-role-key';
        default:
          return undefined;
      }
    });
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: never) => Promise<unknown>) => callback(manager as never),
    );
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 404,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

    await expect(service.deleteAuthenticatedUser({ id: 'user-1' })).resolves.toBeUndefined();
  });

  it('surfaces Supabase admin deletion failures', async () => {
    const manager: QueryManager = {
      query: jest.fn().mockResolvedValue(undefined),
    };
    configService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'SUPABASE_PROJECT_URL':
          return 'https://example.supabase.co';
        case 'SUPABASE_SERVICE_ROLE_KEY':
          return 'service-role-key';
        default:
          return undefined;
      }
    });
    dataSource.transaction.mockImplementation(
      (callback: (entityManager: never) => Promise<unknown>) => callback(manager as never),
    );
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('{"message":"boom"}'),
    } as unknown as Response);

    await expect(service.deleteAuthenticatedUser({ id: 'user-1' })).rejects.toBeInstanceOf(
      BadGatewayException,
    );

    expect(redisClient.set).toHaveBeenCalledTimes(1);
    expect(redisClient.del).toHaveBeenCalledWith(buildDeletedUserAuthKey('user-1'));
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('does not delete the Supabase or Postgres user when the auth tombstone cannot be stored', async () => {
    configService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'SUPABASE_PROJECT_URL':
          return 'https://example.supabase.co';
        case 'SUPABASE_SERVICE_ROLE_KEY':
          return 'service-role-key';
        default:
          return undefined;
      }
    });
    redisClient.set.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.deleteAuthenticatedUser({ id: 'user-1' })).rejects.toThrow(
      'redis unavailable',
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
