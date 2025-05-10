import { Controller, Get } from '@nestjs/common';
import { MethodsService } from './methods.service';
import { MethodDto } from './dto/method.dto';

@Controller('methods')
export class MethodsController {
  constructor(private readonly methodsService: MethodsService) {}

  @Get()
  findAll(): MethodDto[] {
    return this.methodsService.findAll();
  }
}
