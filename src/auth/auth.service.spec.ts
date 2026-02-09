import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { MethodLike } from '../methods/entities/method-like.entity';

describe('AuthService', () => {
  let service: AuthService;
  let repo: jest.Mocked<Pick<Repository<User>, 'findOne' | 'create' | 'save'>>;
  let likesRepo: jest.Mocked<Pick<Repository<MethodLike>, 'count'>>;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    likesRepo = {
      count: jest.fn(),
    };
    service = new AuthService(
      repo as unknown as Repository<User>,
      likesRepo as unknown as Repository<MethodLike>,
    );
  });

  it('creates a new user when it does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockReturnValue({
      id: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205',
      email: 'user@example.com',
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
    likesRepo.count.mockResolvedValue(7);

    const likes = await service.getGivenLikesCount('a42cf41b-2e77-4478-aedf-6cb1f8bce205');

    expect(likesRepo.count).toHaveBeenCalledWith({
      where: { userId: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205' },
    });
    expect(likes).toBe(7);
  });
});
