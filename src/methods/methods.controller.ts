import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { MethodsService } from './methods.service';
import { CreateMethodDto, UpdateMethodDto } from './dto';
import { RuneScapeApiService } from './RuneScapeApiService';

interface PaginatedResult {
  data: any[];
  total: number;
}

// Add new interface to type the user info returned by the API
interface UserInfo {
  levels: Record<string, number>;
  quests: Record<string, number>;
  achievement_diaries: any;
}

@Controller('methods')
export class MethodsController {
  constructor(
    private readonly svc: MethodsService,
    private readonly runescapeApi: RuneScapeApiService,
  ) {}

  @Post()
  async create(@Body() dto: CreateMethodDto) {
    const created = await this.svc.create(dto);
    return { data: created };
  }

  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('perPage') perPage = '10',
    @Query('username') username?: string,
  ) {
    const p = parseInt(page, 10);
    const pp = parseInt(perPage, 10);

    let userInfo: UserInfo | null = null; // Changed type from Record<string, number> to UserInfo
    if (username) {
      try {
        userInfo = (await this.runescapeApi.fetchUserInfo(username)) as UserInfo;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('Error fetching levels for username:', username, err.message);
      }
    }

    // Se pasa userInfo (o null) al método findAllWithProfit
    const result: PaginatedResult = await this.svc.findAllWithProfit(p, pp, userInfo);

    return {
      data: result.data,
      meta: { total: result.total, page: p, perPage: pp, username },
    };
  }

  // Nuevo endpoint para obtener método con datos actualizados desde Redis
  @Get('redis')
  async findAllRedis(@Query('page') page = '1', @Query('perPage') perPage = '10') {
    const p = parseInt(page, 10);
    const pp = parseInt(perPage, 10);
    const result: PaginatedResult = await this.svc.findAll(p, pp);
    return { data: result.data, meta: { total: result.total, page: p, perPage: pp } };
  }

  @Get(':id')
  async findMethodDetailsWithProfit(@Param('id') id: string) {
    const method = (await this.svc.findMethodDetailsWithProfit(id)) as object; // Replace 'object' with the actual expected type if available
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
