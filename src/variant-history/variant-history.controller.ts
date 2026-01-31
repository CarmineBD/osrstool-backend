import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VariantHistoryService } from './variant-history.service';
import { VariantHistoryQueryDto } from './dto/variant-history-query.dto';

const VARIANT_HISTORY_EXAMPLE = {
  data: [
    {
      timestamp: '2026-01-31T18:00:00.000Z',
      high: 1200,
      low: 1100,
    },
  ],
  variant_snapshot: [
    {
      id: 1,
      createdAt: '2026-01-30T12:00:00.000Z',
      data: {},
    },
  ],
};

@ApiTags('variant-history')
@Controller('variants/:id/history')
export class VariantHistoryController {
  constructor(private readonly svc: VariantHistoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Get variant history',
    description: 'Returns price/profit history and snapshots for a variant.',
  })
  @ApiOkResponse({
    description: 'Variant history',
    schema: { example: VARIANT_HISTORY_EXAMPLE },
  })
  async getHistory(@Param('id') variantId: string, @Query() query: VariantHistoryQueryDto) {
    const { history, snapshots } = await this.svc.getHistory(variantId, query);
    return { data: history, variant_snapshot: snapshots };
  }
}
