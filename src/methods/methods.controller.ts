import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MethodsService } from './methods.service';
import { CreateMethodDto, UpdateMethodDto, UpdateMethodBasicDto, UpdateVariantDto } from './dto';

interface PaginatedResult {
  data: any[];
  total: number;
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
      inputs: [{ id: 3144, quantity: 1, reasson: null }],
      outputs: [{ id: 3145, quantity: 1, reasson: null }],
      actionsPerHour: 1200,
      clickIntensity: 2,
      afkiness: 2,
      riskLevel: 'low',
      xpHour: [{ skill: 'Cooking', experience: 300000 }],
      wilderness: false,
    },
  ],
};

@ApiTags('methods')
@Controller('methods')
export class MethodsController {
  constructor(private readonly svc: MethodsService) {}

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
    return this.svc.listWithProfitResponse({
      page,
      perPage,
      username,
      name,
      category,
      clickIntensity,
      afkiness,
      riskLevel,
      xpHour,
      skill,
      showProfitables,
      orderBy,
      order,
    });
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
    return this.svc.methodDetailsWithProfitResponse(id, username);
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
