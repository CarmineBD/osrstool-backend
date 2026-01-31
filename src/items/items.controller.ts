import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ItemsService } from './items.service';
import { BulkUpsertDto, CreateItemDto, UpdateItemDto } from './dto';

const SORT_WHITELIST = new Set([
  'id',
  'name',
  'value',
  'highAlch',
  'lowAlch',
  'buyLimit',
  'weight',
  'lastSyncedAt',
]);

const ITEM_EXAMPLE = {
  id: 4151,
  name: 'Abyssal whip',
  iconUrl: 'https://oldschool.runescape.wiki/images/Abyssal_whip.png',
  examine: 'A weapon from the abyss.',
  value: 120001,
  highAlch: 72000,
  lowAlch: 48000,
  buyLimit: 70,
  questItem: false,
  equipable: true,
  noteable: false,
  stackable: false,
  weight: 0.5,
  tradeable: true,
  members: true,
  lastSyncedAt: '2026-01-31T19:30:00.000Z',
};

const ITEM_COMPACT_EXAMPLE = {
  id: 4151,
  name: 'Abyssal whip',
  iconUrl: 'https://oldschool.runescape.wiki/images/Abyssal_whip.png',
};

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(private readonly svc: ItemsService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search items by name',
    description: 'Returns a compact list of items matching the query string.',
  })
  @ApiQuery({ name: 'q', required: true, description: 'Search term (1-100 chars)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max results (default 20)' })
  @ApiOkResponse({
    description: 'Matching items',
    schema: { example: [ITEM_COMPACT_EXAMPLE] },
  })
  @ApiBadRequestResponse({ description: 'Missing or invalid query parameters' })
  async search(@Query('q') q: string, @Query('limit') limit = '20') {
    if (!q) throw new BadRequestException('q is required');
    if (q.length > 100) throw new BadRequestException('q too long');
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    return this.svc.search(q, lim);
  }

  @Get()
  @ApiOperation({
    summary: 'List items or fetch by ids',
    description:
      'When "ids" is provided, returns a map of items by id. Otherwise returns a paginated list.',
  })
  @ApiQuery({
    name: 'ids',
    required: false,
    description: 'Comma-separated item ids (e.g. 4151,11840)',
  })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Comma-separated fields to include when using ids',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: 'Items per page (default 50, max 100)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    description: 'Sort field (id, name, value, highAlch, lowAlch, buyLimit, weight, lastSyncedAt)',
  })
  @ApiQuery({ name: 'order', required: false, description: 'asc or desc' })
  @ApiQuery({ name: 'members', required: false, description: 'Filter by members=true/false' })
  @ApiQuery({ name: 'tradeable', required: false, description: 'Filter by tradeable=true/false' })
  @ApiOkResponse({
    description: 'Items list or map by id',
    schema: {
      examples: {
        paginated: {
          summary: 'Paginated list',
          value: { data: [ITEM_EXAMPLE], page: 1, pageSize: 50, total: 1234 },
        },
        byIds: {
          summary: 'Lookup by ids',
          value: { '4151': ITEM_EXAMPLE },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid pagination or sorting parameters' })
  async getMany(
    @Query('ids') ids?: string,
    @Query('fields') fields?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('sort') sort = 'id',
    @Query('order') order = 'asc',
    @Query('members') members?: string,
    @Query('tradeable') tradeable?: string,
  ) {
    if (ids) {
      const idList = ids
        .split(',')
        .map((i) => parseInt(i, 10))
        .filter((n) => !Number.isNaN(n));
      const fieldList = fields ? fields.split(',').map((f) => f.trim()) : undefined;
      return this.svc.findByIds(idList, fieldList);
    }

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const psRaw = parseInt(pageSize, 10) || 50;
    if (psRaw > 100) throw new BadRequestException('pageSize too large');
    const ps = Math.min(psRaw, 100);

    const s = sort;
    if (!SORT_WHITELIST.has(s)) throw new BadRequestException('Invalid sort');
    const o = order.toLowerCase();
    if (o !== 'asc' && o !== 'desc') throw new BadRequestException('Invalid order');

    const mem = members === undefined ? undefined : members === 'true' || members === '1';
    const trad = tradeable === undefined ? undefined : tradeable === 'true' || tradeable === '1';

    return this.svc.list(p, ps, s, o, mem, trad);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get item by id', description: 'Returns full item details.' })
  @ApiOkResponse({ description: 'Item detail', schema: { example: ITEM_EXAMPLE } })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create item', description: 'Creates a new item.' })
  @ApiCreatedResponse({ description: 'Item created', schema: { example: ITEM_EXAMPLE } })
  async create(@Body() dto: CreateItemDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update item', description: 'Updates an existing item.' })
  @ApiOkResponse({ description: 'Item updated', schema: { example: ITEM_EXAMPLE } })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete item', description: 'Removes an item by id.' })
  @ApiNoContentResponse({ description: 'Item removed' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }

  @Post('bulk-upsert')
  @ApiOperation({
    summary: 'Bulk upsert items',
    description: 'Creates or updates items in bulk and returns counts.',
  })
  @ApiOkResponse({
    description: 'Upsert result',
    schema: { example: { created: 10, updated: 5 } },
  })
  async bulkUpsert(@Body() dto: BulkUpsertDto) {
    return this.svc.bulkUpsert(dto.items, dto.touchLastSyncedAt ?? true);
  }
}
