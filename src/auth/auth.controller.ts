import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CompleteAccountUsernameDto } from './dto/complete-account-username.dto';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import type { AuthenticatedUser } from './auth.types';

type RequestWithUser = Request & { user: AuthenticatedUser };

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get(['me', 'users/me'])
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get authenticated user',
    description: 'Returns the authenticated Supabase user from the access token.',
  })
  @ApiOkResponse({
    description: 'Authenticated user',
    schema: {
      example: {
        data: {
          id: 'e3f5b8d0-5f52-46f4-8f8a-87d8ad4bf2f4',
          email: 'user@example.com',
          username: 'osrs_user_1',
          plan: 'free',
          role: 'user',
          likes: 3,
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Authenticated token does not include user id' })
  async getMe(@Req() req: RequestWithUser) {
    if (!req.user?.id) {
      throw new ForbiddenException('Authenticated user id is required');
    }

    const user = await this.authService.getOrCreateUser({
      id: req.user.id,
      email: req.user.email,
    });
    const likes = await this.authService.getGivenLikesCount(user.id);

    return {
      data: {
        id: user.id,
        email: user.email,
        username: user.accountUsername,
        plan: user.plan,
        role: user.role,
        likes,
      },
    };
  }

  @Post(['me/account-username', 'users/me/account-username'])
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete authenticated profile with an account username',
    description:
      'Sets the authenticated user account username once. The value is trimmed, normalized to lowercase, validated, and stored in public.users.',
  })
  @ApiOkResponse({
    description: 'Account username completed',
    schema: {
      example: {
        data: {
          username: 'osrs_user_1',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid or reserved username' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Authenticated token does not include user id' })
  @ApiConflictResponse({
    description: 'Username is already taken or the authenticated user has already set one',
  })
  async completeAccountUsername(
    @Req() req: RequestWithUser,
    @Body() dto: CompleteAccountUsernameDto,
  ) {
    if (!req.user?.id) {
      throw new ForbiddenException('Authenticated user id is required');
    }

    const user = await this.authService.setAccountUsername(
      {
        id: req.user.id,
        email: req.user.email,
      },
      dto.username,
    );

    return {
      data: {
        username: user.accountUsername,
      },
    };
  }
}
