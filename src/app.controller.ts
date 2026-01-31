import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('root')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Root endpoint', description: 'Simple hello response.' })
  @ApiOkResponse({ description: 'Hello response', schema: { example: 'Hello World!' } })
  getHello(): string {
    return this.appService.getHello();
  }
}
