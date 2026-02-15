// src/methods/dto/io-item.dto.ts
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { REASON_MAX_LENGTH } from './validation.constants';

export class IoItemDto {
  @IsNumber() id: number;
  @IsNumber() quantity: number;
  @IsString() type: 'input' | 'output';
  @IsOptional()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH)
  @IsSafeMarkdown()
  reason?: string | null;
}
