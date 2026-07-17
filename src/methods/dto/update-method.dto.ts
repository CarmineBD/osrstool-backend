// src/methods/dto/update-method.dto.ts
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
import { UpdateMethodVariantDto } from './update-method-variant.dto';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { DESCRIPTION_MAX_LENGTH, METHOD_NAME_MAX_LENGTH } from './validation.constants';
import { METHOD_CATEGORY_VALUES } from './method-category.constants';
import { TrimLowercaseString, TrimString } from './transforms';

export class UpdateMethodDto {
  @IsOptional()
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(METHOD_NAME_MAX_LENGTH)
  name?: string;

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
  @IsInt()
  @Min(1)
  icon_id?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateMethodVariantDto)
  variants?: UpdateMethodVariantDto[];
}
