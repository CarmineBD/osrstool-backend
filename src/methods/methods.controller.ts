import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { MethodsService } from './methods.service';
import { CreateMethodDto, UpdateMethodDto, UpdateMethodBasicDto, UpdateVariantDto } from './dto';
import { MethodDto } from './dto/method.dto';
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
    @Query('name') name?: string,
    @Query('category') category?: string | string[],
    @Query('clickIntensity') clickIntensity?: string,
    @Query('afkiness') afkiness?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('xpHour') xpHour?: string,
    @Query('skill') skill?: string,
    @Query('showProfitables') showProfitables?: string,
    @Query('orderBy') orderBy = 'highProfit',
    @Query('order') order = 'desc',
  ) {
    const p = parseInt(page, 10);
    const pp = parseInt(perPage, 10);

    let userInfo: UserInfo | null = null;
    const warnings: { code: string; message: string }[] = [];
    if (username) {
      try {
        userInfo = (await this.runescapeApi.fetchUserInfo(username)) as UserInfo;
      } catch (error: any) {
        const message = `No se pudo obtener la información del usuario "${username}".`;
        if (error instanceof Error && error.message.includes('status 404')) {
          warnings.push({ code: 'USER_NOT_FOUND', message });
        } else {
          warnings.push({ code: 'USER_LOOKUP_FAILED', message });
        }
      }
    }

    const filters = {
      name,
      categories: Array.isArray(category)
        ? category
        : category
          ? String(category)
              .split(',')
              .map((c) => c.trim())
          : undefined,
      clickIntensity: clickIntensity ? Number(clickIntensity) : undefined,
      afkiness: afkiness ? Number(afkiness) : undefined,
      riskLevel: riskLevel ? Number(riskLevel) : undefined,
      xpHour: xpHour ? Number(xpHour) : undefined,
      skill: skill ?? undefined,
      showProfitables: showProfitables === 'true' || showProfitables === '1',
    };

    const sortOptions = {
      orderBy: orderBy as 'clickIntensity' | 'afkiness' | 'xpHour' | 'highProfit',
      order: (order as 'asc' | 'desc') ?? 'desc',
    };

    const result: PaginatedResult = await this.svc.findAllWithProfit(
      p,
      pp,
      userInfo,
      filters,
      sortOptions,
    );

    const meta = {
      total: result.total,
      page: p,
      perPage: pp,
      ...(username ? { username } : {}),
    };

    return {
      status: warnings.length ? 'partial' : 'ok',
      data: { methods: result.data, user: userInfo },
      warnings,
      meta,
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
  async findMethodDetailsWithProfit(@Param('id') id: string, @Query('username') username?: string) {
    let userInfo: UserInfo | null = null;
    const warnings: { code: string; message: string }[] = [];
    if (username) {
      try {
        userInfo = (await this.runescapeApi.fetchUserInfo(username)) as UserInfo;
      } catch (error: any) {
        const message = `No se pudo obtener la información del usuario "${username}".`;
        if (error instanceof Error && error.message.includes('status 404')) {
          warnings.push({ code: 'USER_NOT_FOUND', message });
        } else {
          warnings.push({ code: 'USER_LOOKUP_FAILED', message });
        }
      }
    }

    const method = (await this.svc.findMethodDetailsWithProfit(
      id,
      userInfo || undefined,
    )) as unknown as MethodDto;

    return {
      status: warnings.length ? 'partial' : 'ok',
      data: { method, user: userInfo },
      warnings,
      meta: {
        ...(username ? { username } : {}),
      },
    };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMethodDto) {
    const updated = await this.svc.update(id, dto);
    return { data: updated };
  }

  @Put(':id/basic')
  async updateBasic(@Param('id') id: string, @Body() dto: UpdateMethodBasicDto) {
    const updated = await this.svc.updateBasic(id, dto);
    return { data: updated };
  }

  @Put('variant/:id')
  async updateVariant(
    @Param('id') id: string,
    @Body() dto: UpdateVariantDto,
    @Query('generateSnapshot') generateSnapshot = 'false',
  ) {
    const gen = generateSnapshot === 'true';
    const updated = await this.svc.updateVariant(id, dto, gen);
    return { data: updated };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { data: null };
  }
}
