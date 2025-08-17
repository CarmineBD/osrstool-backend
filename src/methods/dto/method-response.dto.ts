// src/methods/dto/method-response.dto.ts
import { IoItemDto } from './io-item.dto';
import { XpHour, VariantRecommendations, VariantRequirements } from '../types';

export class VariantResponseDto {
  id: string;
  label: string;
  description?: string;
  xpHour?: XpHour;
  actionsPerHour?: number;
  clickIntensity?: number;
  afkiness?: number;
  riskLevel?: string;
  requirements?: VariantRequirements;
  recommendations?: VariantRecommendations;
  wilderness?: boolean;
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
