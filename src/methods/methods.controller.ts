// src/methods/methods.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { MethodsService } from './methods.service';
import { CreateMethodDto, UpdateMethodDto } from './dto';

@Controller('methods')
export class MethodsController {
  constructor(private readonly svc: MethodsService) {}

  @Post()
  async create(@Body() dto: CreateMethodDto) {
    const created = await this.svc.create(dto);
    return { data: created };
  }

  @Get()
  async findAll(@Query('page') page = '1', @Query('perPage') perPage = '10') {
    const p = parseInt(page, 10);
    const pp = parseInt(perPage, 10);
    const { data, total } = await this.svc.findAll(p, pp);
    return {
      data,
      meta: { total, page: p, perPage: pp },
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const method = await this.svc.findOne(id);
    return { data: method };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMethodDto) {
    const updated = await this.svc.update(id, dto);
    return { data: updated };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { data: null };
  }
}
