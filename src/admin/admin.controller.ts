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
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { AdminService } from './admin.service';
import { SyncItemsDto } from './dto/sync-items.dto';

type RequestWithUser = Request & { user: AuthenticatedUser };

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get admin overview',
    description: 'Returns aggregate site metrics and latest admin script executions.',
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
            methods: { total: 50, enabled: 48, disabled: 2 },
            variants: { total: 90, enabled: 85, disabled: 5 },
            enabledMethodVariantsBySkill: [
              { skill: 'Cooking', variants: 12 },
              { skill: 'Magic', variants: 8 },
            ],
          },
          latestExecutions: [],
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async getOverview() {
    return this.adminService.getOverview();
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
