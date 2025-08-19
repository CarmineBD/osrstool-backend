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

@Controller('items')
export class ItemsController {
  constructor(private readonly svc: ItemsService) {}

  @Get('search')
  async search(@Query('q') q: string, @Query('limit') limit = '20') {
    if (!q) throw new BadRequestException('q is required');
    if (q.length > 100) throw new BadRequestException('q too long');
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    return this.svc.search(q, lim);
  }

  @Get()
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
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateItemDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }

  @Post('bulk-upsert')
  async bulkUpsert(@Body() dto: BulkUpsertDto) {
    return this.svc.bulkUpsert(dto.items, dto.touchLastSyncedAt ?? true);
  }
}
