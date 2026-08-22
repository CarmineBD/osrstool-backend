import { NotImplementedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { CompleteProfileGuard } from '../auth/complete-profile.guard';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { TermsAcceptanceGuard } from '../auth/terms-acceptance.guard';
import { PresenceHistoryRange } from '../presence/dto/presence-history-query.dto';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';

describe('AdminController guard metadata', () => {
  it('requires SupabaseAuthGuard, TermsAcceptanceGuard, CompleteProfileGuard and SuperAdminGuard for all admin routes', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminController) as unknown[];

    expect(guards).toEqual([
      SupabaseAuthGuard,
      TermsAcceptanceGuard,
      CompleteProfileGuard,
      SuperAdminGuard,
    ]);
  });
});

describe('AdminController', () => {
  it('forwards item sync requests with the authenticated user id', async () => {
    const service: { runItemsSync: jest.Mock } = {
      runItemsSync: jest.fn().mockResolvedValue({ data: { id: 'execution-1' } }),
    };
    const controller = new AdminController(service as unknown as AdminService);
    const req = { user: { id: 'user-1', email: 'admin@example.com' } } as unknown as Request & {
      user: { id: string; email: string };
    };

    await controller.syncItems({ source: 'mapping', dryRun: true }, req);

    expect(service.runItemsSync).toHaveBeenCalledWith(
      { source: 'mapping', dryRun: true },
      'user-1',
    );
  });

  it('forwards admin presence history requests', async () => {
    const service: { getPresenceHistory: jest.Mock } = {
      getPresenceHistory: jest.fn().mockResolvedValue({ data: { points: [] } }),
    };
    const controller = new AdminController(service as unknown as AdminService);

    await controller.getPresenceHistory({ range: PresenceHistoryRange.RANGE_72H });

    expect(service.getPresenceHistory).toHaveBeenCalledWith(PresenceHistoryRange.RANGE_72H);
  });

  it('keeps quest sync as an explicit placeholder', () => {
    const controller = new AdminController({} as AdminService);

    expect(() => controller.syncQuests()).toThrow(NotImplementedException);
  });
});
