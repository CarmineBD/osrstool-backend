import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { VariantSnapshotService } from './variant-snapshot.service';

@ApiTags('variant-snapshots')
@Controller('variant-snapshots')
export class VariantSnapshotController {
  constructor(private readonly svc: VariantSnapshotService) {}

  @Delete(':id')
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete variant snapshot', description: 'Removes a snapshot by id.' })
  @ApiOkResponse({ description: 'Snapshot removed', schema: { example: { data: null } } })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can perform this action' })
  async remove(@Param('id') id: string) {
    await this.svc.remove(Number(id));
    return { data: null };
  }
}
