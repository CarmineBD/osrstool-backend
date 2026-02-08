import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let repo: jest.Mocked<Pick<Repository<User>, 'findOne' | 'create' | 'save'>>;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    service = new AuthService(repo as unknown as Repository<User>);
  });

  it('creates a new user when it does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockReturnValue({
      id: 'a42cf41b-2e77-4478-aedf-6cb1f8bce205',
      email: 'user@example.com',
      plan: 'free',
      role: 'user',
    } as User);
    repo.save.mockImplementation(async (value) => value as User);

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
    repo.save.mockImplementation(async (value) => value as User);

    const result = await service.getOrCreateUser({
      id: existing.id,
      email: 'new@example.com',
    });

    expect(repo.save).toHaveBeenCalled();
    expect(result.email).toBe('new@example.com');
  });
});
