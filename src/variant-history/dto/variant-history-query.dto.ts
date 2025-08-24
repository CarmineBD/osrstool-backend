import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum HistoryRange {
  RANGE_24H = '24h',
  RANGE_1M = '1m',
  RANGE_1Y = '1y',
  RANGE_ALL = 'all',
}

export enum HistoryGranularity {
  MIN_10 = '10m',
  MIN_30 = '30m',
  HOUR_2 = '2h',
  DAY_1 = '1d',
  WEEK_1 = '1w',
  MONTH_1 = '1mo',
  AUTO = 'auto',
}

export enum HistoryAgg {
  AVG = 'avg',
  CLOSE = 'close',
  OHLC = 'ohlc',
}

export class VariantHistoryQueryDto {
  @IsEnum(HistoryRange)
  @IsOptional()
  range?: HistoryRange;

  @IsEnum(HistoryGranularity)
  @IsOptional()
  granularity?: HistoryGranularity;

  @IsEnum(HistoryAgg)
  @IsOptional()
  agg?: HistoryAgg;

  @IsString()
  @IsOptional()
  tz?: string;
}
