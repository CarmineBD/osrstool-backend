import { Controller, Delete, Param } from '@nestjs/common';
import { VariantSnapshotService } from './variant-snapshot.service';

@Controller('variant-snapshots')
export class VariantSnapshotController {
  constructor(private readonly svc: VariantSnapshotService) {}

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.svc.remove(Number(id));
    return { data: null };
  }
}
