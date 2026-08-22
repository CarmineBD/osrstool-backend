import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { TermsAcceptanceGuard } from '../auth/terms-acceptance.guard';
import { PlayerInfoDto, PlayerLookupDto } from './dto/player-info.dto';
import { PlayerInfoRateLimitGuard } from './player-info-rate-limit.guard';
import { RuneScapeApiService } from './RuneScapeApiService';

@ApiTags('player')
@Controller('player')
export class PlayerController {
  constructor(private readonly runescapeApi: RuneScapeApiService) {}

  @Post('info')
  @UseGuards(SupabaseAuthGuard, TermsAcceptanceGuard, PlayerInfoRateLimitGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fetch OSRS player information',
    description:
      'Fetches current OSRS player information. The result is not stored by the backend; clients must persist it and send it as player context to personalized endpoints.',
  })
  @ApiOkResponse({ description: 'Current OSRS player information', type: PlayerInfoDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Current Terms of Service acceptance is required' })
  @ApiTooManyRequestsResponse({
    description: 'Limited to 2 requests per minute per authenticated user',
  })
  async getInfo(@Body() dto: PlayerLookupDto) {
    return this.runescapeApi.fetchUserInfo(dto.username.trim());
  }
}
