import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { MethodsService } from './methods.service';
import { CreateMethodDto, UpdateMethodDto, UpdateMethodBasicDto, UpdateVariantDto } from './dto';
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
    if (username) {
      try {
        userInfo = (await this.runescapeApi.fetchUserInfo(username)) as UserInfo;
      } catch {
        throw new NotFoundException(
          `El usuario "${username}" no existe o no se pudo obtener la información.`,
        );
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
  async findMethodDetailsWithProfit(@Param('id') id: string, @Query('username') username?: string) {
    let userInfo: UserInfo | null = null;
    if (username) {
      try {
        userInfo = (await this.runescapeApi.fetchUserInfo(username)) as UserInfo;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('Error fetching levels for username:', username, err.message);
      }
    }

    const method = (await this.svc.findMethodDetailsWithProfit(
      id,
      userInfo || undefined,
    )) as object;
    return { data: method };
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
