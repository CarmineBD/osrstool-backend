import { VariantRequirements, VariantRecommendations, XpHour } from '../types';

export interface VariantDto {
  id: string;
  slug: string;
  inputs: { id: number; quantity: number; reason?: string | null }[];
  outputs: { id: number; quantity: number; reason?: string | null }[];
  actionsPerHour?: number;
  label?: string;
  description?: string | null;
  clickIntensity?: number;
  afkiness?: number;
  riskLevel?: string;
  requirements?: VariantRequirements | null;
  recommendations?: VariantRecommendations | null;
  xpHour?: XpHour | null;
  wilderness?: boolean;
}

export class MethodDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  enabled: boolean;
  variants: VariantDto[];

  constructor(
    id: string,
    name: string,
    slug: string,
    description: string,
    category: string,
    enabled: boolean,
    variants: VariantDto[],
  ) {
    this.id = id;
    this.name = name;
    this.slug = slug;
    this.description = description;
    this.category = category;
    this.enabled = enabled;
    this.variants = variants;
  }
  static fromEntity(e: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    category?: string;
    enabled: boolean;
    variants: Array<{
      id: string;
      slug: string;
      label: string;
      description: string | null;
      actionsPerHour: number;
      clickIntensity: number;
      afkiness: number;
      riskLevel: string;
      requirements: VariantRequirements | null;
      xpHour: XpHour | null;
      ioItems: Array<{
        itemId: number;
        quantity: number;
        type: 'input' | 'output';
        reason?: string | null;
      }>;
      recommendations: VariantRecommendations | null;
      wilderness: boolean;
    }>;
  }): MethodDto {
    const variants = e.variants.map((variant) => {
      const inputs = variant.ioItems
        .filter((item) => item.type === 'input')
        .map((item) => ({
          id: item.itemId,
          quantity: Number(item.quantity),
          reason: item.reason ?? null,
        }));
      const outputs = variant.ioItems
        .filter((item) => item.type === 'output')
        .map((item) => ({
          id: item.itemId,
          quantity: Number(item.quantity),
          reason: item.reason ?? null,
        }));
      return {
        id: variant.id,
        slug: variant.slug,
        label: variant.label,
        description: variant.description,
        actionsPerHour: variant.actionsPerHour,
        clickIntensity: variant.clickIntensity,
        afkiness: variant.afkiness,
        riskLevel: variant.riskLevel,
        requirements: variant.requirements,
        xpHour: variant.xpHour,
        inputs,
        outputs,
        recommendations: variant.recommendations,
        wilderness: variant.wilderness,
      };
    });
    return new MethodDto(
      e.id,
      e.name,
      e.slug,
      e.description || '',
      e.category || '',
      e.enabled,
      variants,
    );
  }
}
