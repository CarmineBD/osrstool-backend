jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { CompleteProfileGuard } from '../auth/complete-profile.guard';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { TermsAcceptanceGuard } from '../auth/terms-acceptance.guard';
import { MethodsController } from './methods.controller';
import type { MethodsService } from './methods.service';

const player = { levels: { Cooking: 70 }, quests: {}, achievement_diaries: {} };

describe('MethodsController guard metadata', () => {
  const writeRoutes: Array<keyof MethodsController> = [
    'create',
    'update',
    'updateBasic',
    'updateVariant',
    'remove',
  ];

  it.each(writeRoutes)(
    'requires SupabaseAuthGuard, TermsAcceptanceGuard, CompleteProfileGuard and SuperAdminGuard for %s endpoint',
    (methodName) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        MethodsController.prototype[methodName],
      ) as unknown[];
      expect(guards).toEqual([
        SupabaseAuthGuard,
        TermsAcceptanceGuard,
        CompleteProfileGuard,
        SuperAdminGuard,
      ]);
    },
  );

  it('keeps the existing authenticated roadmap permissions', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      MethodsController.prototype,
      'findSkillRoadmap',
    );
    const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor?.value as object) as unknown[];
    expect(guards).toEqual([SupabaseAuthGuard, TermsAcceptanceGuard, CompleteProfileGuard]);
  });
});

describe('MethodsController player context endpoints', () => {
  it('rejects unsupported skill summary query params', async () => {
    const svc = { skillsSummaryWithProfitResponse: jest.fn() };
    const controller = new MethodsController(svc as unknown as MethodsService);

    await expect(
      controller.findSkillsSummary('true', { page: '1' }, { player }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(svc.skillsSummaryWithProfitResponse).not.toHaveBeenCalled();
  });

  it('forwards player context for searches without a RuneScape username', async () => {
    const svc = { listWithProfitResponse: jest.fn().mockResolvedValue({}) };
    const controller = new MethodsController(svc as unknown as MethodsService);
    const req = { headers: { authorization: 'Bearer token' } } as unknown as Request;

    await controller.search(
      'craft',
      '1',
      '10',
      'Skilling',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'true',
      undefined,
      'false',
      undefined,
      'all',
      ['safe'],
      'highProfit',
      'desc',
      { player },
      req,
    );

    expect(svc.listWithProfitResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        player,
        name: 'craft',
        show_only_free_to_play: 'true',
        authorization: 'Bearer token',
      }),
    );
    const calls = svc.listWithProfitResponse.mock.calls as [Record<string, unknown>][];
    expect(calls[0][0]).not.toHaveProperty('username');
  });

  it('forwards the required roadmap player context', async () => {
    const svc = { skillRoadmapResponse: jest.fn().mockResolvedValue({}) };
    const controller = new MethodsController(svc as unknown as MethodsService);
    const req = {
      headers: { authorization: 'Bearer token' },
      user: { id: 'user-1', email: null },
    } as unknown as Request & { user: { id: string; email: null } };

    await controller.findSkillRoadmap(
      'cooking',
      'fastest',
      '99',
      'true',
      ['safe'],
      undefined,
      { skill: 'cooking', strategy: 'fastest' },
      { player },
      req,
    );

    expect(svc.skillRoadmapResponse).toHaveBeenCalledWith(
      expect.objectContaining({ player, authenticatedUserId: 'user-1' }),
    );
  });

  it('forwards player context for method detail', async () => {
    const svc = { methodDetailsWithProfitResponse: jest.fn().mockResolvedValue({}) };
    const controller = new MethodsController(svc as unknown as MethodsService);
    const req = { headers: { authorization: 'Bearer token' } } as unknown as Request;

    await controller.findMethodDetailsWithProfit('method-1', { player }, req);

    expect(svc.methodDetailsWithProfitResponse).toHaveBeenCalledWith(
      'method-1',
      player,
      'Bearer token',
    );
  });
});
