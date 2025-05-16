export interface MethodItem {
  id: number;
  quantity: number;
}

export interface MethodDto {
  id: string; // lo usas como clave en Redis, por eso string
  name: string;
  inputs: MethodItem[];
  outputs: MethodItem[];
}
