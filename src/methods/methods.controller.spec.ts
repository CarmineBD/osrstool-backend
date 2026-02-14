jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { MethodsController } from './methods.controller';

describe('MethodsController guard metadata', () => {
  const writeRoutes: Array<keyof MethodsController> = [
    'create',
    'update',
    'updateBasic',
    'updateVariant',
    'remove',
  ];

  it.each(writeRoutes)(
    'requires SupabaseAuthGuard and SuperAdminGuard for %s endpoint',
    (methodName) => {
      const handler = MethodsController.prototype[methodName];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

      expect(guards).toEqual([SupabaseAuthGuard, SuperAdminGuard]);
    },
  );
});
