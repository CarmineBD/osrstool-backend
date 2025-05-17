export interface VariantDto {
  inputs: { id: number; quantity: number }[];
  outputs: { id: number; quantity: number }[];
}

export class MethodDto {
  id: string;
  name: string;
  variants: VariantDto[];

  constructor(id: string, name: string, variants: VariantDto[]) {
    this.id = id;
    this.name = name;
    this.variants = variants;
  }

  static fromEntity(e: {
    id: string;
    name: string;
    variants: Array<{
      ioItems: Array<{ itemId: number; quantity: number; type: 'input' | 'output' }>;
    }>;
  }): MethodDto {
    const variants = e.variants.map((variant) => {
      const inputs = variant.ioItems
        .filter((item) => item.type === 'input')
        .map((item) => ({ id: item.itemId, quantity: Number(item.quantity) }));
      const outputs = variant.ioItems
        .filter((item) => item.type === 'output')
        .map((item) => ({ id: item.itemId, quantity: Number(item.quantity) }));
      return { inputs, outputs };
    });
    return new MethodDto(e.id, e.name, variants);
  }
}
