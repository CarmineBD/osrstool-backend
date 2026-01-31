import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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

const METHOD_EXAMPLE = {
  id: 'm_123',
  name: 'Cooked karambwan',
  slug: 'cooked-karambwan',
  description: 'Cook karambwans for profit.',
  category: 'Cooking',
  variants: [
    {
      id: 'v_456',
      slug: 'karambwan-basic',
      inputs: [{ id: 3144, quantity: 1 }],
      outputs: [{ id: 3145, quantity: 1 }],
      actionsPerHour: 1200,
      clickIntensity: 2,
      afkiness: 2,
      riskLevel: 'low',
      xpHour: { Cooking: 300000 },
      wilderness: false,
    },
  ],
};

@ApiTags('methods')
@Controller('methods')
export class MethodsController {
  constructor(
    private readonly svc: MethodsService,
    private readonly runescapeApi: RuneScapeApiService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create method', description: 'Creates a new method.' })
  @ApiOkResponse({ description: 'Method created', schema: { example: { data: METHOD_EXAMPLE } } })
  async create(@Body() dto: CreateMethodDto) {
    const created = await this.svc.create(dto);
    return { data: created };
  }

  @Get()
  @ApiOperation({
    summary: 'List methods with profit',
    description: 'Returns methods with profit data and optional user context.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'perPage', required: false, description: 'Items per page (default 10)' })
  @ApiQuery({
    name: 'username',
    required: false,
    description: 'RuneScape username for user context',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category (comma-separated)',
  })
  @ApiQuery({ name: 'skill', required: false, description: 'Filter by skill' })
  @ApiQuery({
    name: 'orderBy',
    required: false,
    description: 'Sort by highProfit, clickIntensity, afkiness, xpHour',
  })
  @ApiQuery({ name: 'order', required: false, description: 'asc or desc' })
  @ApiOkResponse({
    description: 'Methods list',
    schema: {
      example: {
        status: 'ok',
        data: { methods: [METHOD_EXAMPLE], user: null },
        warnings: [],
        meta: { total: 1, page: 1, perPage: 10 },
      },
    },
  })
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
  @ApiOperation({
    summary: 'List methods (Redis)',
    description: 'Returns methods with cached profit data from Redis.',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'perPage', required: false, description: 'Items per page (default 10)' })
  @ApiOkResponse({
    description: 'Methods list (Redis)',
    schema: {
      example: { data: [METHOD_EXAMPLE], meta: { total: 1, page: 1, perPage: 10 } },
    },
  })
  async findAllRedis(@Query('page') page = '1', @Query('perPage') perPage = '10') {
    const p = parseInt(page, 10);
    const pp = parseInt(perPage, 10);
    const result: PaginatedResult = await this.svc.findAll(p, pp);
    return { data: result.data, meta: { total: result.total, page: p, perPage: pp } };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get method detail',
    description: 'Returns a method with profit data and optional user context.',
  })
  @ApiQuery({
    name: 'username',
    required: false,
    description: 'RuneScape username for user context',
  })
  @ApiOkResponse({
    description: 'Method detail',
    schema: {
      example: {
        status: 'ok',
        data: { method: METHOD_EXAMPLE, user: null },
        warnings: [],
        meta: {},
      },
    },
  })
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
  @ApiOperation({ summary: 'Update method', description: 'Updates an existing method.' })
  @ApiOkResponse({ description: 'Method updated', schema: { example: { data: METHOD_EXAMPLE } } })
  async update(@Param('id') id: string, @Body() dto: UpdateMethodDto) {
    const updated = await this.svc.update(id, dto);
    return { data: updated };
  }

  @Put(':id/basic')
  @ApiOperation({
    summary: 'Update method (basic)',
    description: 'Updates basic method fields (name, description, category).',
  })
  @ApiOkResponse({ description: 'Method updated', schema: { example: { data: METHOD_EXAMPLE } } })
  async updateBasic(@Param('id') id: string, @Body() dto: UpdateMethodBasicDto) {
    const updated = await this.svc.updateBasic(id, dto);
    return { data: updated };
  }

  @Put('variant/:id')
  @ApiOperation({
    summary: 'Update method variant',
    description: 'Updates a variant and optionally generates a snapshot.',
  })
  @ApiQuery({ name: 'generateSnapshot', required: false, description: 'true to generate snapshot' })
  @ApiOkResponse({ description: 'Variant updated', schema: { example: { data: METHOD_EXAMPLE } } })
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
  @ApiOperation({ summary: 'Delete method', description: 'Removes a method by id.' })
  @ApiOkResponse({ description: 'Method removed', schema: { example: { data: null } } })
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { data: null };
  }
}
