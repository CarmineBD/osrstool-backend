// src/methods/dto/create-method.dto.ts
import {
  IsString,
  IsOptional,
  ValidateNested,
  IsArray,
  IsBoolean,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVariantDto } from './create-variant.dto';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { DESCRIPTION_MAX_LENGTH } from './validation.constants';

export class CreateMethodDto {
  @IsString() name: string;
  @IsInt() icon_id: number;
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  @IsSafeMarkdown()
  description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}
