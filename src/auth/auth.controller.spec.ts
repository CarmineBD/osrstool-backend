import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  it('returns the authenticated profile including account username and terms status', async () => {
    const authService = {
      getOrCreateUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        accountUsername: 'account_user',
        plan: 'free',
        role: 'user',
      }),
      getGivenLikesCount: jest.fn().mockResolvedValue(3),
      getCurrentTermsStatusForUser: jest.fn().mockResolvedValue({
        currentVersion: 'v1',
        accepted: false,
      }),
    } as unknown as AuthService;
    const controller = new AuthController(authService);

    await expect(
      controller.getMe({
        user: { id: 'user-1', email: 'user@example.com' },
      } as never),
    ).resolves.toEqual({
      data: {
        id: 'user-1',
        email: 'user@example.com',
        username: 'account_user',
        plan: 'free',
        role: 'user',
        likes: 3,
        terms: {
          currentVersion: 'v1',
          accepted: false,
        },
      },
    });
  });

  it('completes account username for the authenticated user', async () => {
    const authService = {
      setAccountUsername: jest.fn().mockResolvedValue({
        accountUsername: 'account_user',
      }),
    } as unknown as AuthService;
    const controller = new AuthController(authService);

    await expect(
      controller.completeAccountUsername(
        {
          user: { id: 'user-1', email: 'user@example.com' },
        } as never,
        { username: 'Account_User' },
      ),
    ).resolves.toEqual({
      data: {
        username: 'account_user',
      },
    });
  });

  it('rejects profile completion when authenticated user id is missing', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(
      controller.completeAccountUsername(
        {
          user: { id: '', email: 'user@example.com' },
        } as never,
        { username: 'account_user' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts the current terms for the authenticated user', async () => {
    const authService = {
      acceptCurrentTerms: jest.fn().mockResolvedValue({
        currentVersion: 'v1',
        accepted: true,
      }),
    } as unknown as AuthService;
    const controller = new AuthController(authService);

    await expect(
      controller.acceptTerms({
        user: { id: 'user-1', email: 'user@example.com' },
      } as never),
    ).resolves.toEqual({
      data: {
        terms: {
          currentVersion: 'v1',
          accepted: true,
        },
      },
    });
  });

  it('rejects terms acceptance when authenticated user id is missing', async () => {
    const controller = new AuthController({} as AuthService);

    await expect(
      controller.acceptTerms({
        user: { id: '', email: 'user@example.com' },
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
