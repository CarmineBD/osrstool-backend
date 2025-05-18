export interface VariantDto {
  id: string;
  inputs: { id: number; quantity: number }[];
  outputs: { id: number; quantity: number }[];
  clickIntensity?: number;
  afkiness?: number;
  riskLevel?: string;
  requirements?: string;
  recommendations?: string;
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
      actionsPerHour: number;
      clickIntensity: number;
      afkiness: number;
      riskLevel: string;
      requirements: string;
      xpHour: string;
      ioItems: Array<{ itemId: number; quantity: number; type: 'input' | 'output' }>;
      recommendations: string;
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
        actionsPerHour: variant.actionsPerHour,
        clickIntensity: variant.clickIntensity,
        afkiness: variant.afkiness,
        riskLevel: variant.riskLevel,
        requirements: variant.requirements,
        xpHour: variant.xpHour,
        inputs,
        outputs,
        recommendations: variant.recommendations,
      };
    });
    return new MethodDto(e.id, e.name, e.description || '', e.category || '', variants);
  }
}
