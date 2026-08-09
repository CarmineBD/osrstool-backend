import {
  Body,
  Controller,
  Get,
  NotImplementedException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CompleteProfileGuard } from '../auth/complete-profile.guard';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import {
  PresenceHistoryQueryDto,
  PresenceHistoryRange,
} from '../presence/dto/presence-history-query.dto';
import { AdminService } from './admin.service';
import { SyncItemsDto } from './dto/sync-items.dto';

type RequestWithUser = Request & { user: AuthenticatedUser };

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, CompleteProfileGuard, SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get admin overview',
    description:
      'Returns aggregate site metrics, latest admin script executions, and recently added catalog entries.',
  })
  @ApiOkResponse({
    description: 'Admin overview',
    schema: {
      example: {
        data: {
          counts: {
            usersRegistered: 10,
            items: 4200,
            quests: 165,
            activeSessions: 17,
            methods: { total: 50, enabled: 48, disabled: 2 },
            variants: { total: 90, enabled: 85, disabled: 5 },
            enabledMethodVariantsBySkill: [
              { skill: 'Cooking', variants: 12 },
              { skill: 'Magic', variants: 8 },
            ],
          },
          latestExecutions: [],
          latestCatalog: {
            items: [
              {
                id: 4151,
                name: 'Abyssal whip',
                iconUrl: 'https://oldschool.runescape.wiki/images/Abyssal_whip.png',
                addedAt: '2026-07-14T18:09:09.834Z',
              },
            ],
            quests: [
              {
                name: "Cook's Assistant",
                slug: 'cooks-assistant',
                addedAt: '2026-02-11T21:32:13.214Z',
              },
            ],
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async getOverview() {
    return this.adminService.getOverview();
  }

  @Get('presence/history')
  @ApiOperation({
    summary: 'Get concurrent users history',
    description:
      'Returns zero-filled concurrent-user history for admin charts. The 72h range includes the current UTC hour as a provisional point sourced from Redis.',
  })
  @ApiQuery({
    name: 'range',
    required: true,
    enum: PresenceHistoryRange,
    description: 'History range to load',
  })
  @ApiOkResponse({
    description: 'Concurrent users history',
    schema: {
      example: {
        data: {
          range: '72h',
          granularity: 'hour',
          timezone: 'UTC',
          points: [
            {
              bucketStart: '2026-08-05T14:00:00.000Z',
              peakOnline: 17,
              provisional: false,
            },
          ],
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async getPresenceHistory(@Query() query: PresenceHistoryQueryDto) {
    return this.adminService.getPresenceHistory(query.range);
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'List admin script executions',
    description: 'Returns recent manual script executions recorded for the admin dashboard.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max rows to return (default 20, max 100)',
  })
  @ApiQuery({ name: 'scriptName', required: false, description: 'Filter by script name' })
  @ApiOkResponse({ description: 'Admin script executions' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async listJobs(@Query('limit') limit?: string, @Query('scriptName') scriptName?: string) {
    return this.adminService.listExecutions(limit, scriptName);
  }

  @Post('sync/items')
  @ApiOperation({
    summary: 'Run item sync manually',
    description: 'Runs a manual item sync and records the execution status.',
  })
  @ApiOkResponse({ description: 'Recorded item sync execution' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async syncItems(@Body() dto: SyncItemsDto | undefined, @Req() req: RequestWithUser) {
    return this.adminService.runItemsSync(dto, req.user.id);
  }

  @Post('sync/quests')
  @ApiOperation({
    summary: 'Run quest sync manually',
    description: 'Placeholder endpoint reserved for quest sync once the logic exists.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  syncQuests() {
    throw new NotImplementedException('Quest sync is not implemented yet');
  }

  @Post('refresh/method-profits')
  @ApiOperation({
    summary: 'Refresh method profits manually',
    description: 'Runs the method profit refresh job and records the execution status.',
  })
  @ApiOkResponse({ description: 'Recorded method profit refresh execution' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async refreshMethodProfits(@Req() req: RequestWithUser) {
    return this.adminService.runMethodProfitRefresh(req.user.id);
  }
}
