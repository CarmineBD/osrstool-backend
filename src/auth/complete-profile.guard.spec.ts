import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ACCOUNT_USERNAME_REQUIRED_ERROR_CODE } from './account-username-required.exception';
import { CompleteProfileGuard } from './complete-profile.guard';
import type { AuthService } from './auth.service';

function createHttpExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('CompleteProfileGuard', () => {
  it('rejects when authenticated user context is missing', async () => {
    const guard = new CompleteProfileGuard({} as AuthService);

    await expect(guard.canActivate(createHttpExecutionContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when account username is missing', async () => {
    const authService = {
      getOrCreateUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        accountUsername: null,
      }),
    } as unknown as AuthService;
    const guard = new CompleteProfileGuard(authService);

    await expect(
      guard.canActivate(
        createHttpExecutionContext({
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        code: ACCOUNT_USERNAME_REQUIRED_ERROR_CODE,
      },
    });
  });

  it('allows access when account username is present', async () => {
    const authService = {
      getOrCreateUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        accountUsername: 'account_user',
      }),
    } as unknown as AuthService;
    const guard = new CompleteProfileGuard(authService);

    await expect(
      guard.canActivate(
        createHttpExecutionContext({
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      ),
    ).resolves.toBe(true);
  });
});
