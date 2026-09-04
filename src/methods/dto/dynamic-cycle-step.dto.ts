import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DYNAMIC_STEP_NAME_MAX_LENGTH, MAX_DYNAMIC_STEP_TICKS } from './validation.constants';
import { TrimString } from './transforms';

export class DynamicCycleStepDto {
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(DYNAMIC_STEP_NAME_MAX_LENGTH)
  name: string;

  @IsInt()
  @Min(0)
  stepOrderPosition: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DYNAMIC_STEP_TICKS)
  durationTicks?: number;

  @IsInt()
  @Min(0)
  @Max(MAX_DYNAMIC_STEP_TICKS)
  clicksMade: number;

  @IsOptional()
  @IsBoolean()
  isAfk?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DYNAMIC_STEP_TICKS)
  actionsMade?: number;
}
