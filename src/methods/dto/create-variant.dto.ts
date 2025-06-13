// src/methods/dto/create-variant.dto.ts
import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IoItemDto } from './io-item.dto';

export class CreateVariantDto {
  @IsOptional()
  @IsString()
  id?: string;
  @IsString() label: string;
  @IsOptional() @IsNumber() actionsPerHour?: number;
  @IsOptional() xpHour?: object;
  @IsOptional() @IsNumber() clickIntensity?: number;
  @IsOptional() @IsNumber() afkiness?: number;
  @IsOptional() @IsString() riskLevel?: string;
  @IsOptional() requirements?: object;
  @IsOptional() recommendations?: object;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IoItemDto)
  inputs: IoItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IoItemDto)
  outputs: IoItemDto[];
}
