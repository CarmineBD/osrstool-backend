// src/methods/dto/update-method-basic.dto.ts
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { DESCRIPTION_MAX_LENGTH, METHOD_NAME_MAX_LENGTH } from './validation.constants';
import { METHOD_CATEGORY_VALUES } from './method-category.constants';
import { TrimLowercaseString, TrimString } from './transforms';

export class UpdateMethodBasicDto {
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
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variants?: string[];
}
