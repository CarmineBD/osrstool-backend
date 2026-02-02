import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule } from '@nestjs/axios';
import { PricesService } from './prices.service';
import { ConfigService } from '@nestjs/config';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    call: jest.fn(),
    quit: jest.fn(),
  })),
}));

describe('PricesService', () => {
  let service: PricesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        PricesService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('redis://localhost:6379') },
        },
      ],
    }).compile();

    service = module.get<PricesService>(PricesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
