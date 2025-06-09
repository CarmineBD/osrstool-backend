// src/methods/dto/io-item.dto.ts
import { IsNumber, IsString } from 'class-validator';

export class IoItemDto {
  @IsNumber() id: number;
  @IsNumber() quantity: number;
  @IsString() type: 'input' | 'output';
}
