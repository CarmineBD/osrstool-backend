// src/methods/dto/create-variant.dto.ts
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IoItemDto } from './io-item.dto';
import { XpHourEntryDto } from './xp-hour-entry.dto';
import { XpHour, VariantRecommendations, VariantRequirements } from '../types';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { DESCRIPTION_MAX_LENGTH } from './validation.constants';

export class CreateVariantDto {
  @IsString() label: string;
  @IsOptional() @IsNumber() actionsPerHour?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => XpHourEntryDto)
  xpHour?: XpHour;
  @IsOptional() @IsNumber() clickIntensity?: number;
  @IsOptional() @IsNumber() afkiness?: number;
  @IsOptional() @IsString() riskLevel?: string;
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  @IsSafeMarkdown()
  description?: string;
  @IsOptional() @IsBoolean() wilderness?: boolean;
  @IsOptional() requirements?: VariantRequirements;
  @IsOptional() recommendations?: VariantRecommendations;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IoItemDto)
  inputs: IoItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IoItemDto)
  outputs: IoItemDto[];
}
