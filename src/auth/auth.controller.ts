import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import type { AuthenticatedUser } from './auth.types';

type RequestWithUser = Request & { user: AuthenticatedUser };

@ApiTags('auth')
@Controller()
export class AuthController {
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
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  getMe(@Req() req: RequestWithUser) {
    return {
      data: {
        id: req.user.id,
        email: req.user.email ?? null,
      },
    };
  }
}
