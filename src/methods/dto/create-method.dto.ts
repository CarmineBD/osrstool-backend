// src/methods/dto/create-method.dto.ts
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  IsArray,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVariantDto } from './create-variant.dto';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { DESCRIPTION_MAX_LENGTH, METHOD_NAME_MAX_LENGTH } from './validation.constants';
import { METHOD_CATEGORY_VALUES } from './method-category.constants';
import { TrimLowercaseString, TrimString } from './transforms';

export class CreateMethodDto {
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(METHOD_NAME_MAX_LENGTH)
  name: string;

  @IsInt()
  @Min(1)
  icon_id: number;

  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  @IsSafeMarkdown()
  description?: string;

  @IsOptional()
  @TrimLowercaseString()
  @IsIn(METHOD_CATEGORY_VALUES)
  category?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}
