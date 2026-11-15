import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MODIFIER_TYPES } from '../modifier.constants';
import { PlayerContextDto } from './player-info.dto';
import { TrimLowercaseString } from './transforms';

export class ModifierSelectionDto {
  @IsIn(MODIFIER_TYPES)
  type: (typeof MODIFIER_TYPES)[number];

  @IsOptional()
  @TrimLowercaseString()
  @IsString()
  skill?: string;

  @IsDefined()
  value: unknown;
}

export class VariantModifierSelectionDto {
  @IsUUID()
  variant_id: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ModifierSelectionDto)
  modifiers: ModifierSelectionDto[];
}

export class ModifierContextDto extends PlayerContextDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VariantModifierSelectionDto)
  modifiers?: VariantModifierSelectionDto[];
}
