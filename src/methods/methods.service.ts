import { Injectable } from '@nestjs/common';
import { MethodDto } from './dto/method.dto';

@Injectable()
export class MethodsService {
  private readonly methods: MethodDto[] = [
    { id: '1', name: 'Mining Iron', gpPerHour: 50000 },
    { id: '2', name: 'Fishing Salmon', gpPerHour: 75000 },
  ];

  findAll(): MethodDto[] {
    return this.methods;
  }
}
