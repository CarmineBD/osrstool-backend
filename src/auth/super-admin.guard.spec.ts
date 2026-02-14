import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from './auth.types';
import { User } from './entities/user.entity';
import { SuperAdminGuard } from './super-admin.guard';

type UserRepo = Pick<Repository<User>, 'findOne'>;

const createContext = (user?: AuthenticatedUser): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }) as ExecutionContext;

describe('SuperAdminGuard', () => {
  let userRepo: jest.Mocked<UserRepo>;
  let guard: SuperAdminGuard;

  beforeEach(() => {
    userRepo = {
      findOne: jest.fn(),
    };
    guard = new SuperAdminGuard(userRepo as unknown as Repository<User>);
  });

  it('returns 401 when authenticated user context is missing', async () => {
    const context = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns 403 when authenticated user is not super_admin', async () => {
    const context = createContext({ id: 'user-1', email: 'user@test.dev' });
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.dev',
      role: 'user',
    } as User);

    const result = guard.canActivate(context);
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(result).rejects.toMatchObject({
      response: { message: 'Only super_admin can perform this action' },
      status: 403,
    });
  });

  it('allows access when authenticated user is super_admin', async () => {
    const context = createContext({ id: 'admin-1', email: 'admin@test.dev' });
    userRepo.findOne.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.dev',
      role: 'super_admin',
    } as User);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 'admin-1' } });
  });
});
