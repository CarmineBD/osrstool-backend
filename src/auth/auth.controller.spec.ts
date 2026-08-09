import { ForbiddenException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  it('returns the authenticated profile including account username', async () => {
    const authService = {
      getOrCreateUser: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        accountUsername: 'account_user',
        plan: 'free',
        role: 'user',
      }),
      getGivenLikesCount: jest.fn().mockResolvedValue(3),
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
});
