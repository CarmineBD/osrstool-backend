import { Controller, Delete, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VariantSnapshotService } from './variant-snapshot.service';

@ApiTags('variant-snapshots')
@Controller('variant-snapshots')
export class VariantSnapshotController {
  constructor(private readonly svc: VariantSnapshotService) {}

  @Delete(':id')
  @ApiOperation({ summary: 'Delete variant snapshot', description: 'Removes a snapshot by id.' })
  @ApiOkResponse({ description: 'Snapshot removed', schema: { example: { data: null } } })
  async remove(@Param('id') id: string) {
    await this.svc.remove(Number(id));
    return { data: null };
  }
}
