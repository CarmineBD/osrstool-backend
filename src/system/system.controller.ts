import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';

import { HealthService } from './health.service';
import { VersionService } from './version.service';

@Controller()
export class SystemController {
  constructor(
    private readonly healthService: HealthService,
    private readonly versionService: VersionService,
  ) {}

  @Get('health')
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.getHealth();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('version')
  getVersion() {
    return this.versionService.getVersion();
  }
}
