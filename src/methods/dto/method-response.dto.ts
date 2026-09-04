// src/methods/dto/method-response.dto.ts
import { IoItemDto } from './io-item.dto';
import { XpHour, VariantRecommendations, VariantRequirements } from '../types';
import { ActionType } from '../action-type.enum';
import { IconSource } from '../../icons/icon-source.enum';
import { CalculationMode } from '../calculation-mode.enum';

export class VariantTagResponseDto {
  label: string;
  description: string;
  severity: 1 | 2 | 3;
}

export class VariantResponseDto {
  id: string;
  slug: string;
  icon_id?: number | null;
  iconSource: IconSource;
  label: string;
  description?: string;
  xpHour?: XpHour;
  actionsPerHour?: number;
  calculationMode?: CalculationMode;
  actionType?: ActionType;
  clickIntensity?: number | null;
  afkiness?: number | null;
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
  likes?: number;
  likedByMe?: boolean;
  tags?: VariantTagResponseDto[];
  inputs: IoItemDto[];
  outputs: IoItemDto[];
  cycleTotalDurationTicks?: number;
  cyclesPerHour?: number;
  action?: {
    id: string;
    name: string;
    rollIntervalTicks: number;
    xpGained: Array<{ skillId: number; skill: string; experience: number }>;
    inputs: Array<{ id: number; quantity: number }>;
    outputs: Array<{ id: number; quantity: number }>;
  };
  cycleSteps?: Array<{
    name: string;
    stepOrderPosition: number;
    durationTicks: number;
    clicksMade: number;
    isAfk: boolean;
    actionsMade: number | null;
  }>;
}

export class MethodResponseDto {
  id: string;
  name: string;
  slug: string;
  icon_id?: number | null;
  iconSource: IconSource;
  description?: string;
  category?: string;
  is_official?: boolean;
  created_by?: {
    id: string;
    username: string | null;
  } | null;
  created_at?: Date;
  updated_at?: Date;
  variants: VariantResponseDto[];
}
