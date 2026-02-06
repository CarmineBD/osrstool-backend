// src/methods/dto/io-item.dto.ts
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class IoItemDto {
  @IsNumber() id: number;
  @IsNumber() quantity: number;
  @IsString() type: 'input' | 'output';
  @IsOptional()
  @IsString()
  reason?: string | null;
}
