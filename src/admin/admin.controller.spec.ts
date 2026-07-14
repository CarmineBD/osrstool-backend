import { NotImplementedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { AdminController } from './admin.controller';
import type { AdminService } from './admin.service';

describe('AdminController guard metadata', () => {
  it('requires SupabaseAuthGuard and SuperAdminGuard for all admin routes', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminController) as unknown[];

    expect(guards).toEqual([SupabaseAuthGuard, SuperAdminGuard]);
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

  it('keeps quest sync as an explicit placeholder', () => {
    const controller = new AdminController({} as AdminService);

    expect(() => controller.syncQuests()).toThrow(NotImplementedException);
  });
});
