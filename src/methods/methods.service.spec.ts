import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { Method } from './entities/method.entity';
import { MethodVariant } from './entities/variant.entity';
import { VariantIoItem } from './entities/io-item.entity';
import { VariantHistory } from './entities/variant-history.entity';
import { MethodsService } from './methods.service';
import type { VariantSnapshotService } from '../variant-snapshots/variant-snapshot.service';
import type { User } from '../auth/entities/user.entity';
import type { Item } from '../items/entities/item.entity';
import type { RedisService } from '../redis/redis.service';

describe('MethodsService player context', () => {
  it('requires a frontend-supplied player object for roadmaps', async () => {
    const redisService = {
      getClient: jest.fn().mockReturnValue({}),
    } as unknown as RedisService;
    const service = new MethodsService(
      {} as Repository<Method>,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      {} as Repository<MethodVariant>,
      {} as Repository<User>,
      {} as VariantSnapshotService,
      { get: jest.fn() } as unknown as ConfigService,
      {} as Repository<Item>,
      redisService,
    );

    await expect(
      service.skillRoadmapResponse({ skill: 'cooking', strategy: 'fastest' }),
    ).rejects.toEqual(new BadRequestException('player is required'));
  });

  it('returns a completed roadmap before discovering candidates', async () => {
    const redisService = {
      getClient: jest.fn().mockReturnValue({}),
    } as unknown as RedisService;
    const service = new MethodsService(
      {} as Repository<Method>,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      {} as Repository<MethodVariant>,
      {} as Repository<User>,
      {} as VariantSnapshotService,
      { get: jest.fn() } as unknown as ConfigService,
      {} as Repository<Item>,
      redisService,
    );
    const internals = service as unknown as {
      findRoadmapCandidates: jest.Mock;
    };
    internals.findRoadmapCandidates = jest.fn();

    const response = await service.skillRoadmapResponse({
      skill: 'fletching',
      strategy: 'profitable',
      show_only_free_to_play: true,
      player: {
        levels: { fletching: 99 },
        experience: { fletching: 13043265 },
        quests: {},
        achievement_diaries: {},
      },
    });

    expect(internals.findRoadmapCandidates).not.toHaveBeenCalled();
    expect(response.data.roadmap).toMatchObject({
      experienceRemaining: 0,
      goalReached: true,
      message: 'Target level 99 has already been reached.',
      ranges: [],
    });
  });

  it('counts only enabled official variants for each skill summary', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        variants: [
          {
            xpHour: [
              { skill: 'Cooking', experience: 100 },
              { skill: 'Fishing', experience: 0 },
            ],
          },
          { xpHour: [{ skill: 'cooking', experience: 200 }] },
        ],
      },
    ]);
    const methodRepo = {
      find,
    } as unknown as Repository<Method>;
    const redisService = {
      getClient: jest.fn().mockReturnValue({}),
    } as unknown as RedisService;
    const service = new MethodsService(
      methodRepo,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      {} as Repository<MethodVariant>,
      {} as Repository<User>,
      {} as VariantSnapshotService,
      { get: jest.fn() } as unknown as ConfigService,
      {} as Repository<Item>,
      redisService,
    );
    const internals = service as unknown as {
      findAllWithVariantsAndProfit: jest.Mock;
    };
    internals.findAllWithVariantsAndProfit = jest.fn().mockResolvedValue([
      {
        id: 'method-1',
        name: 'Cooking method',
        slug: 'cooking-method',
        iconSource: 'item',
        enabled: true,
        variants: [
          {
            id: 'variant-1',
            slug: 'variant-1',
            iconSource: 'item',
            xpHour: [{ skill: 'Cooking', experience: 100 }],
            lowProfit: 1,
            highProfit: 2,
            inputMarketImpactInstant: 0,
            inputMarketImpactSlow: 0,
            outputMarketImpactInstant: 0,
            outputMarketImpactSlow: 0,
            marketImpactInstant: 0,
            marketImpactSlow: 0,
            likes: 0,
          },
        ],
        variantCount: 1,
      },
    ]);

    const response = await service.skillsSummaryWithProfitResponse();

    expect(response.data.cooking.officialVariantCount).toBe(2);
    expect(find).toHaveBeenCalledWith({
      where: { enabled: true, isOfficial: true },
      relations: [
        'variants',
        'variants.ioItems',
        'variants.dynamicAction',
        'variants.dynamicAction.inputs',
        'variants.dynamicAction.outputs',
        'variants.dynamicAction.skillXp',
        'variants.dynamicAction.skillXp.skill',
        'variants.dynamicCycle',
        'variants.dynamicCycle.steps',
      ],
    });
  });

  it('scales roadmap material totals by hours instead of actions per hour', () => {
    const redisService = {
      getClient: jest.fn().mockReturnValue({}),
    } as unknown as RedisService;
    const service = new MethodsService(
      {} as Repository<Method>,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      {} as Repository<MethodVariant>,
      {} as Repository<User>,
      {} as VariantSnapshotService,
      { get: jest.fn() } as unknown as ConfigService,
      {} as Repository<Item>,
      redisService,
    );
    const internals = service as unknown as {
      buildSkillRoadmap: (
        candidates: unknown[],
        userInfo: unknown,
        skill: string,
        strategy: 'fastest' | 'profitable' | 'most_afk',
        skillProgress: { level: number; experience: number; usesExactExperience: boolean },
        targetLevel: number,
      ) => {
        totalInputs: Array<{ id: number; quantity: number }>;
        totalOutputs: Array<{ id: number; quantity: number }>;
      };
    };
    const candidate = {
      method: {
        id: 'method-1',
        name: 'Prayer regeneration method',
        slug: 'prayer-regeneration-method',
        iconSource: 'item',
        enabled: true,
      },
      variant: {
        id: 'variant-1',
        slug: 'prayer-regeneration',
        iconSource: 'item',
        xpPerHour: 258720,
        actionsPerHour: 1960,
        lowProfit: 0,
        highProfit: 0,
        tags: [],
        inputs: [
          { id: 21163, quantity: 30 },
          { id: 29993, quantity: 1764 },
          { id: 30100, quantity: 1960 },
        ],
        outputs: [{ id: 30125, quantity: 1544 }],
      },
    };

    const roadmap = internals.buildSkillRoadmap(
      [candidate],
      {},
      'herblore',
      'fastest',
      { level: 91, experience: 5910436, usesExactExperience: true },
      99,
    );

    expect(roadmap.totalInputs).toEqual([
      { id: 21163, quantity: 827 },
      { id: 29993, quantity: 48573 },
      { id: 30100, quantity: 53970 },
    ]);
    expect(roadmap.totalOutputs).toEqual([{ id: 30125, quantity: 42515 }]);
  });

  it('marks a roadmap as complete when the player already has the target experience', () => {
    const redisService = {
      getClient: jest.fn().mockReturnValue({}),
    } as unknown as RedisService;
    const service = new MethodsService(
      {} as Repository<Method>,
      {} as Repository<MethodVariant>,
      {} as Repository<VariantIoItem>,
      {} as Repository<VariantHistory>,
      {} as Repository<MethodVariant>,
      {} as Repository<User>,
      {} as VariantSnapshotService,
      { get: jest.fn() } as unknown as ConfigService,
      {} as Repository<Item>,
      redisService,
    );
    const internals = service as unknown as {
      buildSkillRoadmap: (
        candidates: unknown[],
        userInfo: unknown,
        skill: string,
        strategy: 'fastest' | 'profitable' | 'most_afk',
        skillProgress: { level: number; experience: number; usesExactExperience: boolean },
        targetLevel: number,
      ) => {
        experienceRemaining: number;
        goalReached: boolean;
        message: string | null;
        ranges: unknown[];
      };
    };

    const roadmap = internals.buildSkillRoadmap(
      [],
      {},
      'fletching',
      'profitable',
      { level: 99, experience: 13043265, usesExactExperience: true },
      99,
    );

    expect(roadmap).toMatchObject({
      experienceRemaining: 0,
      goalReached: true,
      message: 'Target level 99 has already been reached.',
      ranges: [],
    });
  });
});
