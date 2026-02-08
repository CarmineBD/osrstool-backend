// src/methods/dto/update-method-basic.dto.ts
import { IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';

export class UpdateMethodBasicDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) variants?: string[];
}
