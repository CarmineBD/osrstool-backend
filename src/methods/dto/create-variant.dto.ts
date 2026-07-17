// src/methods/dto/create-variant.dto.ts
import {
  ArrayMaxSize,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsArray,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IoItemDto } from './io-item.dto';
import { XpHourEntryDto } from './xp-hour-entry.dto';
import { VariantRecommendations, VariantRequirements, XpHour } from '../types';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import {
  DESCRIPTION_MAX_LENGTH,
  INPUTS_MAX_COUNT,
  MAX_AFKINESS,
  MAX_CLICK_INTENSITY,
  MAX_RISK_LEVEL,
  OUTPUTS_MAX_COUNT,
  REQUIREMENT_ENTRIES_MAX_COUNT,
  VARIANT_LABEL_MAX_LENGTH,
} from './validation.constants';
import { TrimString } from './transforms';
import { VariantRequirementsDto } from './variant-requirements.dto';
import { HasMaxRequirementEntries } from './validators/requirement-entry-count.validator';
import { SKILL_KEY_VALUES } from './skill.constants';

const RISK_LEVEL_PATTERN = /^(100|[1-9]?\d)$/;

export class CreateVariantDto {
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(VARIANT_LABEL_MAX_LENGTH)
  label: string;

  @IsInt()
  @Min(1)
  icon_id: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CLICK_INTENSITY)
  actionsPerHour?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SKILL_KEY_VALUES.length)
  @ValidateNested({ each: true })
  @Type(() => XpHourEntryDto)
  xpHour?: XpHour;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CLICK_INTENSITY)
  clickIntensity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_AFKINESS)
  afkiness?: number;

  @IsOptional()
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_RISK_LEVEL.toString().length)
  @Matches(RISK_LEVEL_PATTERN)
  riskLevel?: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  @IsSafeMarkdown()
  description?: string;

  @IsOptional()
  @IsBoolean()
  wilderness?: boolean;

  @IsOptional()
  @IsBoolean()
  members?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => VariantRequirementsDto)
  @HasMaxRequirementEntries(REQUIREMENT_ENTRIES_MAX_COUNT)
  requirements?: VariantRequirements;

  @IsOptional()
  @ValidateNested()
  @Type(() => VariantRequirementsDto)
  @HasMaxRequirementEntries(REQUIREMENT_ENTRIES_MAX_COUNT)
  recommendations?: VariantRecommendations;

  @IsArray()
  @ArrayMaxSize(INPUTS_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => IoItemDto)
  inputs: IoItemDto[];

  @IsArray()
  @ArrayMaxSize(OUTPUTS_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => IoItemDto)
  outputs: IoItemDto[];
}
