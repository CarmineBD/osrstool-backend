// src/methods/dto/update-method-variant.dto.ts
import { IsOptional, IsString } from 'class-validator';
import { UpdateVariantDto } from './update-variant.dto';

export class UpdateMethodVariantDto extends UpdateVariantDto {
  @IsOptional()
  @IsString()
  id?: string;
}

