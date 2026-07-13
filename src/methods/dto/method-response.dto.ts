// src/methods/dto/method-response.dto.ts
import { IoItemDto } from './io-item.dto';
import { XpHour, VariantRecommendations, VariantRequirements } from '../types';

export class VariantResponseDto {
  id: string;
  slug: string;
  icon_id?: number | null;
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
  members?: boolean;
  inputMarketImpactInstant?: number;
  inputMarketImpactSlow?: number;
  outputMarketImpactInstant?: number;
  outputMarketImpactSlow?: number;
  marketImpactInstant?: number;
  marketImpactSlow?: number;
  inputs: IoItemDto[];
  outputs: IoItemDto[];
}

export class MethodResponseDto {
  id: string;
  name: string;
  slug: string;
  icon_id?: number | null;
  description?: string;
  category?: string;
  variants: VariantResponseDto[];
}
