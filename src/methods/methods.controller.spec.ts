jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { MethodsController } from './methods.controller';
import type { MethodsService } from './methods.service';

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

describe('MethodsController skills summary endpoint', () => {
  it('rejects query params other than username and enabled', async () => {
    const svc: { skillsSummaryWithProfitResponse: jest.Mock } = {
      skillsSummaryWithProfitResponse: jest.fn(),
    };

    const controller = new MethodsController(svc as unknown as MethodsService);

    await expect(
      controller.findSkillsSummary('zezima', 'true', { username: 'zezima', page: '1' }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(svc.skillsSummaryWithProfitResponse).not.toHaveBeenCalled();
  });

  it('forwards username, enabled and authorization header to service', async () => {
    const svc: { skillsSummaryWithProfitResponse: jest.Mock } = {
      skillsSummaryWithProfitResponse: jest.fn().mockResolvedValue({ data: {}, meta: {} }),
    };

    const controller = new MethodsController(svc as unknown as MethodsService);
    const req = { headers: { authorization: 'Bearer token' } } as unknown as Request;

    await controller.findSkillsSummary(
      'zezima',
      'false',
      { username: 'zezima', enabled: 'false' },
      req,
    );

    expect(svc.skillsSummaryWithProfitResponse).toHaveBeenCalledWith(
      'zezima',
      'Bearer token',
      'false',
    );
  });
});

describe('MethodsController trending profit endpoint', () => {
  it('forwards trending profit query params and authorization header to service', async () => {
    const svc: { listTrendingProfitResponse: jest.Mock } = {
      listTrendingProfitResponse: jest.fn().mockResolvedValue({ data: { methods: [] }, meta: {} }),
    };

    const controller = new MethodsController(svc as unknown as MethodsService);
    const req = { headers: { authorization: 'Bearer token' } } as unknown as Request;

    await controller.findTrendingProfit(
      '24h',
      'reliable',
      '2',
      '20',
      'zezima',
      'craft',
      'Skilling',
      '3',
      '4',
      '1',
      'true',
      'Magic',
      'true',
      'false',
      'true',
      'false',
      'all',
      '1000',
      '5',
      '50000',
      undefined,
      req,
    );

    expect(svc.listTrendingProfitResponse).toHaveBeenCalledWith({
      window: '24h',
      mode: 'reliable',
      page: '2',
      perPage: '20',
      username: 'zezima',
      name: 'craft',
      category: 'Skilling',
      clickIntensity: '3',
      afkiness: '4',
      riskLevel: '1',
      givesExperience: 'true',
      skill: 'Magic',
      showProfitables: 'true',
      members: 'false',
      enabled: 'true',
      likedByMe: 'false',
      variants: 'all',
      minGrowthAbs: '1000',
      minGrowthPct: '5',
      minCurrentProfit: '50000',
      minProfit: undefined,
      authorization: 'Bearer token',
    });
  });
});

describe('MethodsController list endpoint', () => {
  it('forwards show_only_free_to_play to the service query object', async () => {
    const svc: { listWithProfitResponse: jest.Mock } = {
      listWithProfitResponse: jest.fn().mockResolvedValue({ data: { methods: [] }, meta: {} }),
    };

    const controller = new MethodsController(svc as unknown as MethodsService);
    const req = { headers: { authorization: 'Bearer token' } } as unknown as Request;

    await controller.findAll(
      'craft',
      '1',
      '10',
      'zezima',
      'Skilling',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'true',
      undefined,
      undefined,
      'all',
      ['safe', 'ge_limits'],
      'highProfit',
      'desc',
      req,
    );

    expect(svc.listWithProfitResponse).toHaveBeenCalledWith({
      page: '1',
      perPage: '10',
      username: 'zezima',
      name: 'craft',
      category: 'Skilling',
      clickIntensity: undefined,
      afkiness: undefined,
      riskLevel: undefined,
      givesExperience: undefined,
      skill: undefined,
      showProfitables: undefined,
      show_only_free_to_play: 'true',
      enabled: undefined,
      likedByMe: undefined,
      variants: 'all',
      ignoredTags: ['safe', 'ge_limits'],
      sortBy: 'highProfit',
      order: 'desc',
      authorization: 'Bearer token',
    });
  });

  it('returns the variant tags catalog from the service', () => {
    const svc: { listVariantTagsResponse: jest.Mock } = {
      listVariantTagsResponse: jest.fn().mockReturnValue({ data: { tags: [{ key: 'safe' }] } }),
    };

    const controller = new MethodsController(svc as unknown as MethodsService);

    expect(controller.listVariantTags()).toEqual({
      data: { tags: [{ key: 'safe' }] },
    });
    expect(svc.listVariantTagsResponse).toHaveBeenCalledTimes(1);
  });
});
