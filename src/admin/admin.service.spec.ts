import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../auth/entities/user.entity';
import { Item } from '../items/entities/item.entity';
import type { ItemsMappingSyncService } from '../items/items-mapping-sync.service';
import type { ItemsWikiSyncService } from '../items/items-wiki-sync.service';
import { Quest } from '../catalogs/entities/quest.entity';
import { Method } from '../methods/entities/method.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import type { MethodProfitRefresherService } from '../method-profit-refresher/method-profit-refresher.service';
import { AdminService } from './admin.service';
import { AdminScriptExecution } from './entities/admin-script-execution.entity';

describe('AdminService', () => {
  function createService() {
    const executionRepo = {
      create: jest.fn((value: Partial<AdminScriptExecution>) => value),
      save: jest.fn((value: Partial<AdminScriptExecution>) =>
        Promise.resolve({
          id: value.id ?? 'execution-1',
          ...value,
        }),
      ),
      find: jest.fn().mockResolvedValue([]),
    };
    const userRepo = { count: jest.fn().mockResolvedValue(0) };
    const itemRepo = {
      count: jest.fn().mockResolvedValue(0),
      query: jest.fn().mockResolvedValue([
        {
          id: 4151,
          name: 'Abyssal whip',
          icon_path: 'Abyssal whip.png',
          created_at: '2026-07-14T18:09:09.834Z',
        },
      ]),
    };
    const questRepo = {
      count: jest.fn().mockResolvedValue(0),
      query: jest.fn().mockResolvedValue([
        {
          name: "Cook's Assistant",
          slug: 'cooks-assistant',
          created_at: '2026-02-11T21:32:13.214Z',
        },
      ]),
    };
    const methodRepo = { count: jest.fn().mockResolvedValue(0) };
    const variantRepo = {
      query: jest.fn((sql: string) => {
        if (sql.includes('GROUP BY method.enabled')) {
          return Promise.resolve([
            { method_enabled: true, variants: 2 },
            { method_enabled: false, variants: '1' },
          ]);
        }

        return Promise.resolve([
          { skill: 'Cooking', variants: 2 },
          { skill: 'Magic', variants: '1' },
        ]);
      }),
    };
    const mappingSync = {
      syncFromMapping: jest.fn().mockResolvedValue({ inserted: 1, updated: 2 }),
    };
    const wikiSync = {
      syncFromWiki: jest.fn().mockResolvedValue({
        totalRowsFound: 1,
        totalSkipped: 0,
        totalScraped: 1,
        totalInserted: 1,
        totalUpdated: 0,
        totalUnchanged: 0,
        totalFailed: 0,
        mode: 'real',
      }),
    };
    const profitRefresher = { refresh: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((key: string) =>
        key === 'CDN_BASE' ? 'https://oldschool.runescape.wiki/images/' : undefined,
      ),
    };

    const service = new AdminService(
      executionRepo as unknown as Repository<AdminScriptExecution>,
      userRepo as unknown as Repository<User>,
      itemRepo as unknown as Repository<Item>,
      questRepo as unknown as Repository<Quest>,
      methodRepo as unknown as Repository<Method>,
      variantRepo as unknown as Repository<MethodVariant>,
      mappingSync as unknown as ItemsMappingSyncService,
      wikiSync as unknown as ItemsWikiSyncService,
      profitRefresher as unknown as MethodProfitRefresherService,
      config as unknown as ConfigService,
    );

    return {
      service,
      executionRepo,
      mappingSync,
      variantRepo,
      itemRepo,
      questRepo,
    };
  }

  it('returns total variants for enabled methods grouped by any xpHour skill on the method', async () => {
    const { service, variantRepo, itemRepo, questRepo } = createService();

    const response = await service.getOverview();

    expect(variantRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('method.enabled = true'),
    );
    expect(variantRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('INNER JOIN method_variants variant ON variant.method_id'),
    );
    expect(variantRepo.query).toHaveBeenCalledWith(expect.stringContaining('LOWER'));
    expect(variantRepo.query).toHaveBeenCalledWith(expect.stringContaining('INITCAP'));
    expect(response.data.counts.variants).toEqual({
      total: 3,
      enabled: 2,
      disabled: 1,
    });
    expect(response.data.counts.enabledMethodVariantsBySkill).toEqual([
      { skill: 'Cooking', variants: 2 },
      { skill: 'Magic', variants: 1 },
    ]);
    expect(itemRepo.query).toHaveBeenCalledWith(expect.stringContaining('FROM items'));
    expect(questRepo.query).toHaveBeenCalledWith(expect.stringContaining('FROM quests'));
    expect(response.data.latestCatalog).toEqual({
      items: [
        {
          id: 4151,
          name: 'Abyssal whip',
          iconUrl: 'https://oldschool.runescape.wiki/images/Abyssal_whip.png',
          addedAt: '2026-07-14T18:09:09.834Z',
        },
      ],
      quests: [
        {
          name: "Cook's Assistant",
          slug: 'cooks-assistant',
          addedAt: '2026-02-11T21:32:13.214Z',
        },
      ],
    });
  });

  it('records a successful mapping item sync execution', async () => {
    const { service, executionRepo, mappingSync } = createService();

    const response = await service.runItemsSync(
      { source: 'mapping', dryRun: true, chunkSize: 10 },
      'user-1',
    );

    expect(mappingSync.syncFromMapping).toHaveBeenCalledWith({
      dryRun: true,
      chunkSize: 10,
    });
    expect(executionRepo.save).toHaveBeenCalledTimes(2);
    expect(executionRepo.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        scriptName: 'items:mapping:sync',
        status: 'running',
        requestedByUserId: 'user-1',
      }),
    );
    expect(response.data).toMatchObject({
      scriptName: 'items:mapping:sync',
      status: 'succeeded',
      result: { inserted: 1, updated: 2 },
    });
  });

  it('rejects unknown item sync sources', async () => {
    const { service } = createService();

    await expect(
      service.runItemsSync({ source: 'other' as 'mapping' }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
