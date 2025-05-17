// src/methods/dto/method-response.dto.ts
import { IoItemDto } from './io-item.dto';

export class VariantResponseDto {
  id: string;
  label: string;
  xpHour?: object;
  actionsPerHour?: number;
  inputs: IoItemDto[];
  outputs: IoItemDto[];
}

export class MethodResponseDto {
  id: string;
  name: string;
  description?: string;
  category?: string;
  variants: VariantResponseDto[];
}
