import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthService } from './health.service';
import { VersionService } from './version.service';

const HEALTH_EXAMPLE = {
  status: 'ok',
  uptime: 12345,
  dependencies: {
    db: { status: 'ok', latencyMs: 12 },
    redis: { status: 'ok', latencyMs: 8 },
  },
};

const VERSION_EXAMPLE = {
  version: '0.0.1',
  commit: 'abcdef1',
  buildDate: '2026-01-31T20:00:00.000Z',
};

@ApiTags('system')
@Controller()
export class SystemController {
  constructor(
    private readonly healthService: HealthService,
    private readonly versionService: VersionService,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns service health and dependencies.',
  })
  @ApiOkResponse({ description: 'Health status', schema: { example: HEALTH_EXAMPLE } })
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.getHealth();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('version')
  @ApiOperation({ summary: 'Version info', description: 'Returns build/version metadata.' })
  @ApiOkResponse({ description: 'Version response', schema: { example: VERSION_EXAMPLE } })
  getVersion() {
    return this.versionService.getVersion();
  }
}
