import { Controller, Get, Param, Query } from '@nestjs/common';
import { VariantHistoryService } from './variant-history.service';
import { VariantHistoryQueryDto } from './dto/variant-history-query.dto';

@Controller('variants/:id/history')
export class VariantHistoryController {
  constructor(private readonly svc: VariantHistoryService) {}

  @Get()
  async getHistory(@Param('id') variantId: string, @Query() query: VariantHistoryQueryDto) {
    const { history, snapshots } = await this.svc.getHistory(variantId, query);
    return { data: history, variant_snapshot: snapshots };
  }
}
