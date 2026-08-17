import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { TERMS_ACCEPTANCE_REQUIRED_ERROR_CODE } from './terms-acceptance-required.exception';
import type { AuthService } from './auth.service';
import { TermsAcceptanceGuard } from './terms-acceptance.guard';

function createHttpExecutionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('TermsAcceptanceGuard', () => {
  it('rejects when authenticated user context is missing', async () => {
    const guard = new TermsAcceptanceGuard({} as AuthService);

    await expect(guard.canActivate(createHttpExecutionContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when current terms are not accepted', async () => {
    const authService = {
      getOrCreateUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      }),
      getCurrentTermsStatusForUser: jest.fn().mockResolvedValue({
        currentVersion: 'v1',
        accepted: false,
      }),
    } as unknown as AuthService;
    const guard = new TermsAcceptanceGuard(authService);

    await expect(
      guard.canActivate(
        createHttpExecutionContext({
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        code: TERMS_ACCEPTANCE_REQUIRED_ERROR_CODE,
        currentVersion: 'v1',
      },
    });
  });

  it('allows access when current terms are accepted', async () => {
    const authService = {
      getOrCreateUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      }),
      getCurrentTermsStatusForUser: jest.fn().mockResolvedValue({
        currentVersion: 'v1',
        accepted: true,
      }),
    } as unknown as AuthService;
    const guard = new TermsAcceptanceGuard(authService);

    await expect(
      guard.canActivate(
        createHttpExecutionContext({
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      ),
    ).resolves.toBe(true);
  });
});
