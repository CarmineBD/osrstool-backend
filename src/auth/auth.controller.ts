import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import type { AuthenticatedUser } from './auth.types';

type RequestWithUser = Request & { user: AuthenticatedUser };

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
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
          plan: 'free',
          role: 'user',
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

    return {
      data: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        role: user.role,
      },
    };
  }
}
