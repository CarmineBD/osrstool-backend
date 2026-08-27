import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { PricesService } from './prices.service';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { Repository } from 'typeorm';
import { ItemPriceRule } from './entities/item-price-rule.entity';
import { RedisService } from '../redis/redis.service';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    call: jest.fn(),
    quit: jest.fn(),
  })),
}));

describe('PricesService', () => {
  let service: PricesService;
  const httpGet = jest.fn();
  const configGet = jest.fn();
  const redisCall = jest.fn();
  const priceRuleFind = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    configGet.mockImplementation((key: string) =>
      key === 'SCHEDULED_JOBS_ENABLED' ? 'false' : undefined,
    );
    priceRuleFind.mockResolvedValue([]);
    service = new PricesService(
      { get: httpGet } as unknown as HttpService,
      { get: configGet } as unknown as ConfigService,
      { find: priceRuleFind } as unknown as Repository<ItemPriceRule>,
      { getClient: () => ({ call: redisCall }) } as unknown as RedisService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sends the configured OSRS Wiki user agent when fetching prices', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'OSRS_WIKI_USER_AGENT' ? 'RSMethods production contact@example.com' : undefined,
    );
    httpGet.mockReturnValue(of({ data: { data: {} } }));

    await service.fetchPrices();

    expect(httpGet).toHaveBeenCalledWith('https://prices.runescape.wiki/api/v1/osrs/latest', {
      headers: { 'User-Agent': 'RSMethods production contact@example.com' },
    });
  });

  it('uses a descriptive fallback user agent when none is configured', async () => {
    httpGet.mockReturnValue(of({ data: { data: {} } }));

    await service.fetchPrices();

    expect(httpGet).toHaveBeenCalledWith('https://prices.runescape.wiki/api/v1/osrs/latest', {
      headers: { 'User-Agent': 'RSMethods/1.0 (contact: contact@rsmethods.com)' },
    });
  });

  it('logs compact HTTP error details without the Axios error object', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const error = Object.assign(new Error('Request failed with status code 403'), {
      response: {
        status: 403,
        data: { error: 'Forbidden', reason: 'Missing User-Agent' },
      },
    });
    httpGet.mockReturnValue(throwError(() => error));

    await service.fetchPrices();

    expect(loggerError).toHaveBeenCalledWith(
      'Error fetching prices: status=403 message=Request failed with status code 403 responseData={"error":"Forbidden","reason":"Missing User-Agent"}',
    );
    expect(loggerError.mock.calls[0]).toHaveLength(1);
  });
});
