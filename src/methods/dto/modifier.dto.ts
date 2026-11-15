import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MODIFIER_OPERATIONS,
  MODIFIER_TARGET_TYPES,
  MODIFIER_TYPES,
  MODIFIER_VALUE_TYPES,
} from '../modifier.constants';
import { TrimString } from './transforms';

export class ModifierEffectDto {
  @IsIn(MODIFIER_TARGET_TYPES)
  target_type: (typeof MODIFIER_TARGET_TYPES)[number];

  @IsUUID()
  target_id: string;

  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  target_property: string;

  @IsIn(MODIFIER_OPERATIONS)
  operation: (typeof MODIFIER_OPERATIONS)[number];

  @IsIn(MODIFIER_VALUE_TYPES)
  value_type: (typeof MODIFIER_VALUE_TYPES)[number];

  @IsDefined()
  value: unknown;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priority?: number;
}

export class ModifierDto {
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsIn(MODIFIER_TYPES)
  type: (typeof MODIFIER_TYPES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  skill_id?: number;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ModifierEffectDto)
  effects: ModifierEffectDto[];
}
