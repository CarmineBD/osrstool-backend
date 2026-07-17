// src/methods/dto/update-method-variant.dto.ts
import { IsOptional, IsString } from 'class-validator';
import { UpdateVariantDto } from './update-variant.dto';
import { TrimString } from './transforms';

export class UpdateMethodVariantDto extends UpdateVariantDto {
  @IsOptional()
  @TrimString()
  @IsString()
  id?: string;
}
