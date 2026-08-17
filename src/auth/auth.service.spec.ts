import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { UserTermsAcceptance } from './entities/user-terms-acceptance.entity';

describe('AuthService', () => {
  let service: AuthService;
  let repo: jest.Mocked<Pick<Repository<User>, 'findOne' | 'create' | 'save'>>;
  let likesRepo: jest.Mocked<Pick<Repository<MethodVariant>, 'createQueryBuilder'>>;
  let termsRepo: jest.Mocked<Pick<Repository<UserTermsAcceptance>, 'findOne' | 'create' | 'save'>>;
  let likesQueryBuilder: {
    where: jest.Mock;
    getCount: jest.Mock;
  };

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
    service = new AuthService(
      repo as unknown as Repository<User>,
      likesRepo as unknown as Repository<MethodVariant>,
      termsRepo as unknown as Repository<UserTermsAcceptance>,
    );
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
});
