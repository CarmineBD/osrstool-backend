import { Controller, Delete, Param } from '@nestjs/common';
import { VariantSnapshotsService } from './variant-snapshots.service';

@Controller('variant-snapshots')
export class VariantSnapshotsController {
  constructor(private readonly svc: VariantSnapshotsService) {}

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { data: null };
  }
}
