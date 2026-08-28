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
      relations: ['variants'],
    });
  });
});
