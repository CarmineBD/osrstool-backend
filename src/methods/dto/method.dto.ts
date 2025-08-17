import { VariantRequirements, VariantRecommendations, XpHour } from '../types';

export interface VariantDto {
  id: string;
  inputs: { id: number; quantity: number }[];
  outputs: { id: number; quantity: number }[];
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
  description?: string;
  category?: string;
  variants: VariantDto[];

  constructor(
    id: string,
    name: string,
    description: string,
    category: string,
    variants: VariantDto[],
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.category = category;
    this.variants = variants;
  }
  static fromEntity(e: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    variants: Array<{
      id: string;
      label: string;
      description: string | null;
      actionsPerHour: number;
      clickIntensity: number;
      afkiness: number;
      riskLevel: string;
      requirements: VariantRequirements | null;
      xpHour: XpHour | null;
      ioItems: Array<{ itemId: number; quantity: number; type: 'input' | 'output' }>;
      recommendations: VariantRecommendations | null;
      wilderness: boolean;
    }>;
  }): MethodDto {
    const variants = e.variants.map((variant) => {
      const inputs = variant.ioItems
        .filter((item) => item.type === 'input')
        .map((item) => ({ id: item.itemId, quantity: Number(item.quantity) }));
      const outputs = variant.ioItems
        .filter((item) => item.type === 'output')
        .map((item) => ({ id: item.itemId, quantity: Number(item.quantity) }));
      return {
        id: variant.id,
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
    return new MethodDto(e.id, e.name, e.description || '', e.category || '', variants);
  }
}
