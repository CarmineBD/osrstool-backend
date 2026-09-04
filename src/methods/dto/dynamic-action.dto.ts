import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ActionSkillXpDto } from './action-skill-xp.dto';
import { DynamicActionItemDto } from './dynamic-action-item.dto';
import { TrimString } from './transforms';
import {
  DYNAMIC_ACTION_ITEMS_MAX_COUNT,
  DYNAMIC_ACTION_NAME_MAX_LENGTH,
  MAX_DYNAMIC_ROLL_INTERVAL_TICKS,
} from './validation.constants';

export class DynamicActionDto {
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(DYNAMIC_ACTION_NAME_MAX_LENGTH)
  name: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DYNAMIC_ROLL_INTERVAL_TICKS)
  rollIntervalTicks: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DYNAMIC_ACTION_ITEMS_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => DynamicActionItemDto)
  inputs?: DynamicActionItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DYNAMIC_ACTION_ITEMS_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => DynamicActionItemDto)
  outputs?: DynamicActionItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DYNAMIC_ACTION_ITEMS_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => ActionSkillXpDto)
  xpGained?: ActionSkillXpDto[];
}
