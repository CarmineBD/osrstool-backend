import { VariantRequirements, VariantRecommendations, XpHour } from '../types';
import { ActionType } from '../action-type.enum';
import { IconSource } from '../../icons/icon-source.enum';
import { CalculationMode } from '../calculation-mode.enum';
import { calculateDynamicVariant } from '../dynamic-variant-calculator';
import { ActionCondition } from '../action-condition.enum';

export interface VariantDto {
  id: string;
  slug: string;
  icon_id?: number | null;
  iconSource: IconSource;
  inputs: { id: number; quantity: number; reason?: string | null }[];
  outputs: { id: number; quantity: number; reason?: string | null }[];
  actionsPerHour?: number;
  actionType?: ActionType;
  label?: string;
  description?: string | null;
  clickIntensity?: number | null;
  afkiness?: number | null;
  riskLevel?: string;
  requirements?: VariantRequirements | null;
  recommendations?: VariantRecommendations | null;
  xpHour?: XpHour | null;
  wilderness?: boolean;
  members?: boolean;
  likesCount?: number;
  likedUserIds?: string[];
  calculationMode?: CalculationMode;
  cycleTotalDurationTicks?: number;
  cyclesPerHour?: number;
  action?: {
    id: string;
    name: string;
    rollIntervalTicks: number;
    baseSuccessChance: number;
    xpGained: Array<{
      skillId: number;
      skill: string;
      experience: number;
      condition: ActionCondition;
    }>;
    inputs: { id: number; quantity: number; condition: ActionCondition }[];
    outputs: { id: number; quantity: number; condition: ActionCondition }[];
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

export class MethodDto {
  id: string;
  name: string;
  slug: string;
  icon_id?: number | null;
  iconSource: IconSource;
  description?: string;
  category?: string;
  enabled: boolean;
  is_official: boolean;
  variants: VariantDto[];

  constructor(
    id: string,
    name: string,
    slug: string,
    icon_id: number | null | undefined,
    description: string,
    category: string,
    enabled: boolean,
    is_official: boolean,
    variants: VariantDto[],
    iconSource: IconSource = IconSource.ITEM,
  ) {
    this.id = id;
    this.name = name;
    this.slug = slug;
    this.icon_id = icon_id;
    this.iconSource = iconSource;
    this.description = description;
    this.category = category;
    this.enabled = enabled;
    this.is_official = is_official;
    this.variants = variants;
  }
  static fromEntity(e: {
    id: string;
    name: string;
    slug: string;
    iconId?: number | null;
    iconSource: IconSource;
    description?: string;
    category?: string;
    enabled: boolean;
    isOfficial?: boolean | null;
    variants: Array<{
      id: string;
      slug: string;
      iconId?: number | null;
      iconSource: IconSource;
      label: string;
      description: string | null;
      actionsPerHour: number | null;
      actionType: ActionType | null;
      clickIntensity: number | null;
      afkiness: number | null;
      riskLevel: string;
      requirements: VariantRequirements | null;
      xpHour: XpHour | null;
      ioItems?: Array<{
        itemId: number;
        quantity: number;
        type: 'input' | 'output';
        reason?: string | null;
      }>;
      recommendations: VariantRecommendations | null;
      wilderness: boolean;
      members?: boolean;
      likesCount?: number;
      likedUserIds?: string[];
      calculationMode?: CalculationMode;
      dynamicAction?: {
        id: string;
        name: string;
        rollIntervalTicks: number;
        baseSuccessChance?: number | string;
        inputs?: Array<{
          itemId: number;
          quantity: number | string;
          condition?: ActionCondition;
        }>;
        outputs?: Array<{
          itemId: number;
          quantity: number | string;
          condition?: ActionCondition;
        }>;
        skillXp?: Array<{
          skillId: number;
          experience: number | string;
          condition?: ActionCondition;
          skill?: { key?: string | null } | null;
        }>;
      } | null;
      dynamicCycle?: {
        steps?: Array<{
          name: string;
          stepOrderPosition: number;
          durationTicks: number | null;
          clicksMade: number;
          isAfk: boolean;
          actionsMade: number | null;
        }>;
      } | null;
    }>;
  }): MethodDto {
    const variants = e.variants.map((variant) => {
      const fixedInputs = (variant.ioItems ?? [])
        .filter((item) => item.type === 'input')
        .map((item) => ({
          id: item.itemId,
          quantity: Number(item.quantity),
          reason: item.reason ?? null,
        }))
        .filter(({ quantity }) => quantity !== 0);
      const fixedOutputs = (variant.ioItems ?? [])
        .filter((item) => item.type === 'output')
        .map((item) => ({
          id: item.itemId,
          quantity: Number(item.quantity),
          reason: item.reason ?? null,
        }))
        .filter(({ quantity }) => quantity !== 0);
      const fixedXpHour = variant.xpHour?.filter(({ experience }) => experience !== 0) ?? null;
      const calculationMode = variant.calculationMode ?? CalculationMode.FIXED;
      const dynamicCalculation =
        calculationMode === CalculationMode.DYNAMIC && variant.dynamicAction && variant.dynamicCycle
          ? calculateDynamicVariant(variant.dynamicAction, variant.dynamicCycle.steps ?? [])
          : null;

      if (calculationMode === CalculationMode.DYNAMIC && !dynamicCalculation) {
        throw new Error(
          `Dynamic variant ${variant.id} is missing its action or cycle configuration`,
        );
      }

      return {
        id: variant.id,
        slug: variant.slug,
        icon_id: variant.iconId,
        iconSource: variant.iconSource,
        label: variant.label,
        description: variant.description,
        calculationMode,
        actionsPerHour: dynamicCalculation?.actionsPerHour ?? variant.actionsPerHour ?? undefined,
        ...(calculationMode === CalculationMode.FIXED
          ? { actionType: variant.actionType ?? undefined }
          : {}),
        clickIntensity: dynamicCalculation?.clickIntensity ?? variant.clickIntensity,
        afkiness: dynamicCalculation?.afkiness ?? variant.afkiness,
        riskLevel: variant.riskLevel,
        requirements: variant.requirements,
        xpHour: dynamicCalculation?.xpHour ?? fixedXpHour,
        inputs: dynamicCalculation?.inputs ?? fixedInputs,
        outputs: dynamicCalculation?.outputs ?? fixedOutputs,
        recommendations: variant.recommendations,
        wilderness: variant.wilderness,
        members: variant.members ?? false,
        likesCount: variant.likesCount ?? 0,
        likedUserIds: variant.likedUserIds ?? [],
        ...(dynamicCalculation
          ? {
              cycleTotalDurationTicks: dynamicCalculation.cycleTotalDurationTicks,
              cyclesPerHour: dynamicCalculation.cyclesPerHour,
              action: dynamicCalculation.action,
              cycleSteps: dynamicCalculation.cycleSteps,
            }
          : {}),
      };
    });
    return new MethodDto(
      e.id,
      e.name,
      e.slug,
      e.iconId,
      e.description || '',
      e.category || '',
      e.enabled,
      e.isOfficial ?? false,
      variants,
      e.iconSource,
    );
  }
}
