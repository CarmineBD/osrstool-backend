// src/methods/dto/update-method.dto.ts
import { IsArray, IsOptional, IsString, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateMethodVariantDto } from './update-method-variant.dto';

export class UpdateMethodDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateMethodVariantDto)
  variants?: UpdateMethodVariantDto[];
}
