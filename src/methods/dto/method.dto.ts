import { VariantRequirements, VariantRecommendations, XpHour } from '../types';

export interface VariantDto {
  id: string;
  slug: string;
  icon_id?: number | null;
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
  members?: boolean;
  likesCount?: number;
  likedUserIds?: string[];
}

export class MethodDto {
  id: string;
  name: string;
  slug: string;
  icon_id?: number | null;
  description?: string;
  category?: string;
  enabled: boolean;
  variants: VariantDto[];

  constructor(
    id: string,
    name: string,
    slug: string,
    icon_id: number | null | undefined,
    description: string,
    category: string,
    enabled: boolean,
    variants: VariantDto[],
  ) {
    this.id = id;
    this.name = name;
    this.slug = slug;
    this.icon_id = icon_id;
    this.description = description;
    this.category = category;
    this.enabled = enabled;
    this.variants = variants;
  }
  static fromEntity(e: {
    id: string;
    name: string;
    slug: string;
    iconId?: number | null;
    description?: string;
    category?: string;
    enabled: boolean;
    variants: Array<{
      id: string;
      slug: string;
      iconId?: number | null;
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
      members?: boolean;
      likesCount?: number;
      likedUserIds?: string[];
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
        icon_id: variant.iconId,
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
        members: variant.members ?? false,
        likesCount: variant.likesCount ?? 0,
        likedUserIds: variant.likedUserIds ?? [],
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
      variants,
    );
  }
}
