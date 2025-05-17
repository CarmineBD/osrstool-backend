// src/methods/dto/method.dto.ts

export class MethodDto {
  id: string;
  name: string;
  inputs: { id: number; quantity: number }[];
  outputs: { id: number; quantity: number }[];

  constructor(
    id: string,
    name: string,
    inputs: { id: number; quantity: number }[],
    outputs: { id: number; quantity: number }[],
  ) {
    this.id = id;
    this.name = name;
    this.inputs = inputs;
    this.outputs = outputs;
  }

  static fromEntity(e: {
    id: string;
    name: string;
    variants: Array<{
      ioItems: Array<{ itemId: number; quantity: number; type: 'input' | 'output' }>;
    }>;
  }): MethodDto {
    const inputs = e.variants
      .flatMap((v) => v.ioItems)
      .filter((i) => i.type === 'input')
      .map((i) => ({ id: i.itemId, quantity: Number(i.quantity) }));

    const outputs = e.variants
      .flatMap((v) => v.ioItems)
      .filter((i) => i.type === 'output')
      .map((i) => ({ id: i.itemId, quantity: Number(i.quantity) }));

    return new MethodDto(e.id, e.name, inputs, outputs);
  }
}
