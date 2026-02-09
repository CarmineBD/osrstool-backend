import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { MethodsService } from './methods.service';
import { CreateMethodDto, UpdateMethodDto, UpdateMethodBasicDto, UpdateVariantDto } from './dto';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthenticatedUser } from '../auth/auth.types';

interface PaginatedResult {
  data: any[];
  total: number;
}

type RequestWithUser = Request & { user?: AuthenticatedUser };

const METHOD_EXAMPLE = {
  id: 'm_123',
  name: 'Cooked karambwan',
  slug: 'cooked-karambwan',
  description: 'Cook karambwans for profit.',
  category: 'Cooking',
  enabled: true,
  likes: 120,
  likedByMe: false,
  variants: [
    {
      id: 'v_456',
      slug: 'karambwan-basic',
      inputs: [{ id: 3144, quantity: 1, reason: null }],
      outputs: [{ id: 3145, quantity: 1, reason: null }],
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
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create method', description: 'Creates a new method.' })
  @ApiOkResponse({ description: 'Method created', schema: { example: { data: METHOD_EXAMPLE } } })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can modify methods and variants' })
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
    description: 'Filter by a single category',
  })
  @ApiQuery({ name: 'skill', required: false, description: 'Filter by skill' })
  @ApiQuery({
    name: 'givesExperience',
    required: false,
    description: 'true or false',
  })
  @ApiQuery({
    name: 'showProfitables',
    required: false,
    description: 'true or false',
  })
  @ApiQuery({
    name: 'enabled',
    required: false,
    description: 'true or false (default true)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Sort by highProfit, clickIntensity, afkiness, xpHour, likes',
  })
  @ApiQuery({
    name: 'likedByMe',
    required: false,
    description: 'true to return only methods liked by the authenticated user',
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
    @Query('category') category?: string,
    @Query('clickIntensity') clickIntensity?: string,
    @Query('afkiness') afkiness?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('givesExperience') givesExperience?: string,
    @Query('skill') skill?: string,
    @Query('showProfitables') showProfitables?: string,
    @Query('enabled') enabled?: string | boolean,
    @Query('likedByMe') likedByMe?: string | boolean,
    @Query('sortBy') sortBy = 'highProfit',
    @Query('order') order = 'desc',
    @Req() req?: Request,
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
      givesExperience,
      skill,
      showProfitables,
      enabled,
      likedByMe,
      sortBy,
      order,
      authorization: req?.headers.authorization,
    });
  }
  @Post(':methodId/like')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Like method',
    description: 'Creates a like for the authenticated user. Idempotent if already liked.',
  })
  @ApiOkResponse({ description: 'Like created', schema: { example: { data: { liked: true } } } })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  async likeMethod(@Param('methodId') methodId: string, @Req() req: RequestWithUser) {
    if (!req.user?.id) {
      throw new ForbiddenException('Authenticated user id is required');
    }

    await this.svc.likeMethod(methodId, req.user.id, req.user.email);
    return { data: { liked: true } };
  }

  @Delete(':methodId/like')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Unlike method',
    description: 'Removes the like for the authenticated user.',
  })
  @ApiOkResponse({ description: 'Like removed', schema: { example: { data: { liked: false } } } })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  async unlikeMethod(@Param('methodId') methodId: string, @Req() req: RequestWithUser) {
    if (!req.user?.id) {
      throw new ForbiddenException('Authenticated user id is required');
    }

    await this.svc.unlikeMethod(methodId, req.user.id);
    return { data: { liked: false } };
  }

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

  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Get method detail by slug',
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
  async findMethodDetailsWithProfitBySlug(
    @Param('slug') slug: string,
    @Query('username') username?: string,
    @Req() req?: Request,
  ): Promise<unknown> {
    return this.svc.methodDetailsWithProfitResponseBySlug(
      slug,
      username,
      req?.headers.authorization,
    );
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
  async findMethodDetailsWithProfit(
    @Param('id') id: string,
    @Query('username') username?: string,
    @Req() req?: Request,
  ): Promise<unknown> {
    return this.svc.methodDetailsWithProfitResponse(id, username, req?.headers.authorization);
  }

  @Put(':id')
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update method', description: 'Updates an existing method.' })
  @ApiOkResponse({ description: 'Method updated', schema: { example: { data: METHOD_EXAMPLE } } })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can modify methods and variants' })
  async update(@Param('id') id: string, @Body() dto: UpdateMethodDto) {
    const updated = await this.svc.update(id, dto);
    return { data: updated };
  }

  @Put(':id/basic')
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update method (basic)',
    description: 'Updates basic method fields (name, description, category).',
  })
  @ApiOkResponse({ description: 'Method updated', schema: { example: { data: METHOD_EXAMPLE } } })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can modify methods and variants' })
  async updateBasic(@Param('id') id: string, @Body() dto: UpdateMethodBasicDto) {
    const updated = await this.svc.updateBasic(id, dto);
    return { data: updated };
  }

  @Put('variant/:id')
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update method variant',
    description: 'Updates a variant and optionally generates a snapshot.',
  })
  @ApiQuery({ name: 'generateSnapshot', required: false, description: 'true to generate snapshot' })
  @ApiOkResponse({ description: 'Variant updated', schema: { example: { data: METHOD_EXAMPLE } } })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can modify methods and variants' })
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
  @UseGuards(SupabaseAuthGuard, SuperAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete method', description: 'Removes a method by id.' })
  @ApiOkResponse({ description: 'Method removed', schema: { example: { data: null } } })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
  @ApiForbiddenResponse({ description: 'Only super_admin can modify methods and variants' })
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return { data: null };
  }
}
