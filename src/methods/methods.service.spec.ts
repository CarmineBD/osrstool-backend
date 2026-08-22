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
});
