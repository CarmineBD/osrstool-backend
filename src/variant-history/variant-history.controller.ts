import { Controller, Get, Query } from '@nestjs/common';
import { VariantHistoryService } from './variant-history.service';

@Controller('variant-history')
export class VariantHistoryController {
  constructor(private readonly svc: VariantHistoryService) {}

  @Get()
  async getHistory(
    @Query('variantId') variantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const history = await this.svc.getHistory(variantId, from, to);
    return { data: history };
  }
}
