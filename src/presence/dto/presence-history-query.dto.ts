import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum PresenceHistoryRange {
  RANGE_72H = '72h',
  RANGE_30D = '30d',
  RANGE_1Y = '1y',
}

export class PresenceHistoryQueryDto {
  @ApiProperty({
    enum: PresenceHistoryRange,
    description: 'History window to return for concurrent users.',
    example: PresenceHistoryRange.RANGE_72H,
  })
  @IsEnum(PresenceHistoryRange)
  range: PresenceHistoryRange;
}
