import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OptionalSupabaseAuthGuard } from '../auth/optional-supabase-auth.guard';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { PresenceOnlineResponseDto } from './dto/presence-online-response.dto';
import { PresenceService } from './presence.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@ApiTags('presence')
@Controller('presence')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Post('heartbeat')
  @UseGuards(OptionalSupabaseAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register presence heartbeat',
    description:
      'Refreshes the presence timestamp for the current visitor and returns the estimated online count. Uses the authenticated user id when a valid bearer token is present; otherwise requires visitorId.',
  })
  @ApiBody({
    required: false,
    type: HeartbeatDto,
    description:
      'Anonymous clients should send visitorId. Authenticated clients may omit it because the bearer token user id takes precedence.',
  })
  @ApiOkResponse({
    description: 'Presence heartbeat accepted',
    type: PresenceOnlineResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid visitorId or missing visitorId for anonymous requests',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired bearer token when Authorization header is present',
  })
  @ApiTooManyRequestsResponse({
    description: 'Heartbeat rate limit exceeded',
  })
  async heartbeat(
    @Body() body: HeartbeatDto,
    @Req() req: RequestWithUser,
  ): Promise<PresenceOnlineResponseDto> {
    const online = await this.presenceService.recordHeartbeat({
      authenticatedUserId: req.user?.id,
      visitorId: body?.visitorId,
    });

    return { online };
  }

  @Get('online')
  @ApiOperation({
    summary: 'Get estimated online count',
    description:
      'Returns the estimated number of online visitors after pruning expired presence records.',
  })
  @ApiOkResponse({
    description: 'Estimated online visitor count',
    type: PresenceOnlineResponseDto,
  })
  async getOnline(): Promise<PresenceOnlineResponseDto> {
    const online = await this.presenceService.getOnlineCount();
    return { online };
  }
}
