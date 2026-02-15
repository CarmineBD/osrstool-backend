// src/methods/dto/update-method-basic.dto.ts
import { IsOptional, IsString, IsArray, IsBoolean, MaxLength } from 'class-validator';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { DESCRIPTION_MAX_LENGTH } from './validation.constants';

export class UpdateMethodBasicDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  @IsSafeMarkdown()
  description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) variants?: string[];
}
