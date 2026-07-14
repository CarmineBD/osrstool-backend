import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { VariantSnapshotController } from './variant-snapshot.controller';

describe('VariantSnapshotController guard metadata', () => {
  it('requires SupabaseAuthGuard and SuperAdminGuard to delete snapshots', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      VariantSnapshotController.prototype,
      'remove',
    );
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      descriptor?.value as (...args: unknown[]) => unknown,
    ) as unknown[];

    expect(guards).toEqual([SupabaseAuthGuard, SuperAdminGuard]);
  });
});
