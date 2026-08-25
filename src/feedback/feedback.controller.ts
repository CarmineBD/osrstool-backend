import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CompleteProfileGuard } from '../auth/complete-profile.guard';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { TermsAcceptanceGuard } from '../auth/terms-acceptance.guard';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackListQueryDto } from './dto/feedback-list-query.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackService } from './feedback.service';

type RequestWithUser = Request & { user: AuthenticatedUser };

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(SupabaseAuthGuard, TermsAcceptanceGuard, CompleteProfileGuard)
  @Throttle({ default: { limit: 5, ttl: 3600 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create feedback',
    description:
      'Creates feedback for the authenticated user. Requires accepted Terms of Service and a completed account username.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Current terms and an account username are required' })
  @ApiTooManyRequestsResponse({ description: 'Maximum of five feedback submissions per hour' })
  async create(@Body() dto: CreateFeedbackDto, @Req() req: RequestWithUser) {
    return { feedback: await this.feedbackService.create(req.user.id, dto) };
  }

  @Get()
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List feedback', description: 'Lists feedback for super_admin users.' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async list(@Query() query: FeedbackListQueryDto) {
    return this.feedbackService.list(query);
  }

  @Get(':id')
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get feedback detail',
    description: 'Gets feedback detail for super_admin users.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async findOne(@Param('id') id: string) {
    return { feedback: await this.feedbackService.findOne(id) };
  }

  @Patch(':id')
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update feedback status',
    description: 'Updates feedback status for super_admin users.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateFeedbackStatusDto) {
    return { feedback: await this.feedbackService.updateStatus(id, dto) };
  }
}
