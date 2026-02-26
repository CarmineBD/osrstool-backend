import { AxiosResponse } from 'axios';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { ItemsMappingSyncService } from './items-mapping-sync.service';

const MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
const DEFAULT_USER_AGENT = 'osrstool-backend items-sync (contact: set OSRS_WIKI_USER_AGENT)';

describe('ItemsMappingSyncService', () => {
  const repo: jest.Mocked<Pick<Repository<Item>, 'find' | 'insert' | 'upsert'>> = {
    find: jest.fn(),
    insert: jest.fn(),
    upsert: jest.fn(),
  };
  const httpGet = jest.fn();
  const configGet = jest.fn();

  const service = new ItemsMappingSyncService(
    { get: httpGet } as unknown as HttpService,
    repo as unknown as Repository<Item>,
    { get: configGet } as unknown as ConfigService,
  );

  const mockMappingResponse = (data: unknown): AxiosResponse<unknown> =>
    ({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as AxiosResponse['config']['headers'] },
    }) as AxiosResponse<unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.insert.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] });
    repo.upsert.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] });
  });

  it('returns inserted/updated counts in dry-run mode without writing', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'OSRS_WIKI_USER_AGENT' ? 'custom-user-agent' : undefined,
    );
    httpGet.mockReturnValue(
      of(
        mockMappingResponse([
          {
            id: 100,
            name: 'Rune sword',
            examine: 'A sword.',
            members: false,
            lowalch: 6000,
            highalch: 9000,
            limit: 70,
            value: 12000,
            icon: 'Rune_sword.png',
          },
          {
            id: 101,
            name: 'New item',
            examine: null,
            members: true,
            lowalch: null,
            highalch: null,
            limit: null,
            value: null,
            icon: 'New_item.png',
          },
        ]),
      ),
    );
    repo.find.mockResolvedValue([
      {
        id: 100,
        name: 'Rune sword',
        examine: 'A sword.',
        members: false,
        lowAlch: 6000,
        highAlch: 8500,
        buyLimit: 70,
        value: 12000,
        iconPath: 'Rune_sword.png',
      } as Item,
    ]);

    const result = await service.syncFromMapping({ dryRun: true, chunkSize: 2 });

    expect(result).toEqual({ inserted: 1, updated: 1 });
    expect(repo.insert).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(httpGet).toHaveBeenCalledWith(MAPPING_URL, {
      headers: { 'User-Agent': 'custom-user-agent' },
    });
  });

  it('writes missing and changed items in chunks when not dry-run', async () => {
    configGet.mockReturnValue(undefined);
    httpGet.mockReturnValue(
      of(
        mockMappingResponse([
          {
            id: 1,
            name: 'Item 1',
            examine: 'desc 1',
            members: false,
            lowalch: 10,
            highalch: 20,
            limit: 100,
            value: 200,
            icon: 'item_1.png',
          },
          {
            id: 2,
            name: 'Item 2',
            examine: 'desc 2',
            members: true,
            lowalch: 11,
            highalch: 21,
            limit: 101,
            value: 201,
            icon: 'item_2.png',
          },
          {
            id: 3,
            name: 'Item 3',
            examine: 'desc 3',
            members: false,
            lowalch: 12,
            highalch: 22,
            limit: 102,
            value: 202,
            icon: 'item_3.png',
          },
          {
            id: 4,
            name: 'Item 4',
            examine: 'desc 4',
            members: false,
            lowalch: 13,
            highalch: 23,
            limit: 103,
            value: 203,
            icon: 'item_4.png',
          },
        ]),
      ),
    );
    repo.find.mockResolvedValue([
      {
        id: 1,
        name: 'Item 1',
        examine: 'desc 1',
        members: false,
        lowAlch: 10,
        highAlch: 20,
        buyLimit: 100,
        value: 200,
        iconPath: 'item_1.png',
      } as Item,
      {
        id: 2,
        name: 'Item 2',
        examine: 'desc 2',
        members: true,
        lowAlch: 11,
        highAlch: 21,
        buyLimit: 101,
        value: 200,
        iconPath: 'item_2.png',
      } as Item,
      {
        id: 3,
        name: 'Item 3',
        examine: 'desc 3',
        members: false,
        lowAlch: 12,
        highAlch: 22,
        buyLimit: 102,
        value: 202,
        iconPath: 'item_3_old.png',
      } as Item,
    ]);

    const result = await service.syncFromMapping({ chunkSize: 1 });

    expect(result).toEqual({ inserted: 1, updated: 2 });
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 4,
        name: 'Item 4',
        iconPath: 'item_4.png',
        tradeable: true,
      }),
    ]);
    expect(repo.upsert).toHaveBeenCalledTimes(2);
    expect(repo.upsert.mock.calls[0]?.[1]).toEqual(['id']);
    expect(repo.upsert.mock.calls[1]?.[1]).toEqual(['id']);
    expect(httpGet).toHaveBeenCalledWith(MAPPING_URL, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
    });
  });

  it('fails for invalid chunk size', async () => {
    await expect(service.syncFromMapping({ chunkSize: 0 })).rejects.toThrow(
      'chunkSize must be a positive integer.',
    );
    expect(httpGet).not.toHaveBeenCalled();
  });
});
