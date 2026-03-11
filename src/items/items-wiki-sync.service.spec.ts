import { AxiosResponse } from 'axios';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { of, throwError } from 'rxjs';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { ItemsWikiSyncService } from './items-wiki-sync.service';
import * as parserModule from './items-wiki-sync.parsers';

jest.mock('./items-wiki-sync.parsers', () => ({
  ...jest.requireActual<typeof import('./items-wiki-sync.parsers')>('./items-wiki-sync.parsers'),
  parseItemIndexPage: jest.fn(),
  parseItemDetailPage: jest.fn(),
  isApiOrCacheOnlyItemPage: jest.fn(),
  isObsoleteItemPage: jest.fn(),
  getIndexNameIgnoreReason: jest.fn(),
}));

describe('ItemsWikiSyncService', () => {
  const repo: jest.Mocked<Pick<Repository<Item>, 'find' | 'insert' | 'update'>> = {
    find: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const httpGet = jest.fn();
  const configGet = jest.fn();

  const parseItemIndexPageMock = jest.mocked(parserModule.parseItemIndexPage);
  const parseItemDetailPageMock = jest.mocked(parserModule.parseItemDetailPage);
  const isApiOrCacheOnlyItemPageMock = jest.mocked(parserModule.isApiOrCacheOnlyItemPage);
  const isObsoleteItemPageMock = jest.mocked(parserModule.isObsoleteItemPage);
  const getIndexNameIgnoreReasonMock = jest.mocked(parserModule.getIndexNameIgnoreReason);

  const service = new ItemsWikiSyncService(
    { get: httpGet } as unknown as HttpService,
    repo as unknown as Repository<Item>,
    { get: configGet } as unknown as ConfigService,
  );

  const makeTextResponse = (data: string): AxiosResponse<string> =>
    ({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as AxiosResponse['config']['headers'] },
    }) as AxiosResponse<string>;

  beforeEach(() => {
    jest.clearAllMocks();
    configGet.mockReturnValue(undefined);
    repo.find.mockResolvedValue([]);
    repo.insert.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] });
    repo.update.mockResolvedValue({ generatedMaps: [], raw: [], affected: 1 });
    isApiOrCacheOnlyItemPageMock.mockReturnValue(false);
    isObsoleteItemPageMock.mockReturnValue(false);
    getIndexNameIgnoreReasonMock.mockReturnValue(null);
  });

  it('deduplicates detail requests by canonical url without hash', async () => {
    parseItemIndexPageMock.mockReturnValue([
      {
        name: 'Agility potion (1)',
        itemIdText: '3038',
        detailUrl: 'https://oldschool.runescape.wiki/w/Agility_potion#(1)',
      },
      {
        name: 'Agility potion (2)',
        itemIdText: '3036',
        detailUrl: 'https://oldschool.runescape.wiki/w/Agility_potion#(2)',
      },
      {
        name: 'Agility potion (3)',
        itemIdText: '3034',
        detailUrl: 'https://oldschool.runescape.wiki/w/Agility_potion#(3)',
      },
      {
        name: 'Agility potion (4)',
        itemIdText: '3032',
        detailUrl: 'https://oldschool.runescape.wiki/w/Agility_potion#(4)',
      },
    ]);
    parseItemDetailPageMock.mockReturnValue([
      {
        id: 3038,
        name: 'Agility potion(1)',
        iconPath: 'Agility_potion(1).png',
        examine: '1 dose.',
        value: 30,
        highAlch: 18,
        lowAlch: 12,
        buyLimit: 2000,
        questItem: false,
        equipable: false,
        noteable: true,
        stackable: false,
        weight: 0.002,
        tradeable: true,
        members: false,
      },
      {
        id: 3036,
        name: 'Agility potion(2)',
        iconPath: 'Agility_potion(2).png',
        examine: '2 doses.',
        value: 30,
        highAlch: 18,
        lowAlch: 12,
        buyLimit: 2000,
        questItem: false,
        equipable: false,
        noteable: true,
        stackable: false,
        weight: 0.002,
        tradeable: true,
        members: false,
      },
      {
        id: 3034,
        name: 'Agility potion(3)',
        iconPath: 'Agility_potion(3).png',
        examine: '3 doses.',
        value: 30,
        highAlch: 18,
        lowAlch: 12,
        buyLimit: 2000,
        questItem: false,
        equipable: false,
        noteable: true,
        stackable: false,
        weight: 0.002,
        tradeable: true,
        members: false,
      },
      {
        id: 3032,
        name: 'Agility potion(4)',
        iconPath: 'Agility_potion(4).png',
        examine: '4 doses.',
        value: 30,
        highAlch: 18,
        lowAlch: 12,
        buyLimit: 2000,
        questItem: false,
        equipable: false,
        noteable: true,
        stackable: false,
        weight: 0.002,
        tradeable: true,
        members: false,
      },
    ]);

    httpGet
      .mockReturnValueOnce(of(makeTextResponse('<html>index</html>')))
      .mockReturnValueOnce(of(makeTextResponse('<html>detail</html>')));

    const summary = await service.syncFromWiki({ dryRun: true, writeSqlFile: false });

    expect(summary).toMatchObject({
      totalRowsFound: 4,
      totalSkipped: 3,
      totalScraped: 4,
      totalInserted: 4,
      totalUpdated: 0,
      totalUnchanged: 0,
      totalFailed: 0,
    });
    expect(httpGet).toHaveBeenCalledTimes(2);
    const detailCall = httpGet.mock.calls[1] as [string, unknown] | undefined;
    expect(detailCall?.[0]).toBe('https://oldschool.runescape.wiki/w/Agility_potion');
    expect(parseItemDetailPageMock).toHaveBeenCalledTimes(1);
  });

  it('retries detail fetch once on transient failure', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      parseItemIndexPageMock.mockReturnValue([
        {
          name: 'Dragon scimitar',
          itemIdText: '4587',
          detailUrl: 'https://oldschool.runescape.wiki/w/Dragon_scimitar',
        },
      ]);
      parseItemDetailPageMock.mockReturnValue([
        {
          id: 4587,
          name: 'Dragon scimitar',
          iconPath: 'Dragon_scimitar.png',
          examine: 'A vicious, curved sword.',
          value: 100000,
          highAlch: 60000,
          lowAlch: 40000,
          buyLimit: 70,
          questItem: false,
          equipable: true,
          noteable: true,
          stackable: false,
          weight: 1.814,
          tradeable: true,
          members: true,
        },
      ]);

      httpGet
        .mockReturnValueOnce(of(makeTextResponse('<html>index</html>')))
        .mockReturnValueOnce(throwError(() => new Error('network timeout')))
        .mockReturnValueOnce(of(makeTextResponse('<html>detail</html>')));

      const summary = await service.syncFromWiki({ dryRun: true, writeSqlFile: false });

      expect(summary.totalFailed).toBe(0);
      expect(summary.totalInserted).toBe(1);
      expect(httpGet).toHaveBeenCalledTimes(3);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[RETRY] item detail page'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('keeps deduplication by item id for duplicated parsed records', async () => {
    parseItemIndexPageMock.mockReturnValue([
      {
        name: 'Example item',
        itemIdText: '100',
        detailUrl: 'https://oldschool.runescape.wiki/w/Example_item',
      },
    ]);
    parseItemDetailPageMock.mockReturnValue([
      {
        id: 100,
        name: 'Example item',
        iconPath: 'Example_item.png',
        examine: 'One.',
        value: 1,
        highAlch: 1,
        lowAlch: 1,
        buyLimit: 1,
        questItem: false,
        equipable: false,
        noteable: false,
        stackable: false,
        weight: 1,
        tradeable: true,
        members: false,
      },
      {
        id: 100,
        name: 'Example item duplicate',
        iconPath: 'Example_item.png',
        examine: 'Two.',
        value: 2,
        highAlch: 2,
        lowAlch: 2,
        buyLimit: 2,
        questItem: false,
        equipable: false,
        noteable: false,
        stackable: false,
        weight: 2,
        tradeable: true,
        members: false,
      },
    ]);

    httpGet
      .mockReturnValueOnce(of(makeTextResponse('<html>index</html>')))
      .mockReturnValueOnce(of(makeTextResponse('<html>detail</html>')));

    const summary = await service.syncFromWiki({ dryRun: true, writeSqlFile: false });

    expect(summary.totalScraped).toBe(2);
    expect(summary.totalSkipped).toBe(1);
    expect(summary.totalInserted).toBe(1);
    expect(summary.totalFailed).toBe(0);
  });

  it('skips items marked as api/cache-only', async () => {
    parseItemIndexPageMock.mockReturnValue([
      {
        name: 'Future item',
        itemIdText: '99999',
        detailUrl: 'https://oldschool.runescape.wiki/w/Future_item',
      },
    ]);
    isApiOrCacheOnlyItemPageMock.mockReturnValue(true);

    httpGet
      .mockReturnValueOnce(of(makeTextResponse('<html>index</html>')))
      .mockReturnValueOnce(of(makeTextResponse('<html>detail</html>')));

    const summary = await service.syncFromWiki({ dryRun: true, writeSqlFile: false });

    expect(summary).toMatchObject({
      totalRowsFound: 1,
      totalSkipped: 1,
      totalScraped: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalUnchanged: 0,
      totalFailed: 0,
    });
    expect(parseItemDetailPageMock).not.toHaveBeenCalled();
  });

  it('writes sql artifact for dry-run output', async () => {
    parseItemIndexPageMock.mockReturnValue([
      {
        name: 'Dragon scimitar',
        itemIdText: '4587',
        detailUrl: 'https://oldschool.runescape.wiki/w/Dragon_scimitar',
      },
    ]);
    parseItemDetailPageMock.mockReturnValue([
      {
        id: 4587,
        name: 'Dragon scimitar',
        iconPath: 'Dragon_scimitar.png',
        examine: 'A vicious, curved sword.',
        value: 100000,
        highAlch: 60000,
        lowAlch: 40000,
        buyLimit: 70,
        questItem: false,
        equipable: true,
        noteable: true,
        stackable: false,
        weight: 1.814,
        tradeable: true,
        members: true,
      },
    ]);

    httpGet
      .mockReturnValueOnce(of(makeTextResponse('<html>index</html>')))
      .mockReturnValueOnce(of(makeTextResponse('<html>detail</html>')));

    const sqlPath = join(tmpdir(), `items-wiki-sync-test-${Date.now()}.sql`);

    try {
      const summary = await service.syncFromWiki({ dryRun: true, sqlFilePath: sqlPath });
      const fileContent = await readFile(sqlPath, 'utf8');

      expect(summary.sqlFilePath).toBe(sqlPath);
      expect(fileContent).toContain('BEGIN;');
      expect(fileContent).toContain('INSERT INTO items');
      expect(fileContent).toContain('Dragon scimitar');
      expect(fileContent).toContain('COMMIT;');
    } finally {
      await unlink(sqlPath).catch(() => undefined);
    }
  });
});
