import { Injectable } from '@nestjs/common';
import { MethodDto } from './dto/method.dto';

@Injectable()
export class MethodsService {
  private readonly methods: MethodDto[] = [
    {
      id: '1',
      name: 'Mining Iron ores',
      inputs: [],
      outputs: [{ id: 440, quantity: 1700 }],
    },
    {
      id: '2',
      name: 'Mining runite ore',
      inputs: [],
      outputs: [{ id: 451, quantity: 65 }],
    },
  ];

  findAll(): MethodDto[] {
    return this.methods;
  }
}
