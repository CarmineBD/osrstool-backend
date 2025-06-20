// src/methods/dto/update-variant.dto.ts
import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IoItemDto } from './io-item.dto';

export class UpdateVariantDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsNumber() actionsPerHour?: number;
  @IsOptional() xpHour?: object;
  @IsOptional() @IsNumber() clickIntensity?: number;
  @IsOptional() @IsNumber() afkiness?: number;
  @IsOptional() @IsString() riskLevel?: string;
  @IsOptional() requirements?: object;
  @IsOptional() recommendations?: object;

  @IsOptional() @IsString() snapshotName?: string;
  @IsOptional() @IsString() snapshotDescription?: string;
  @IsOptional() @IsString() snapshotDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IoItemDto)
  inputs?: IoItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IoItemDto)
  outputs?: IoItemDto[];
}
