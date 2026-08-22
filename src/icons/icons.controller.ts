import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IconsService } from './icons.service';
import {
  ICON_SEARCH_TYPE_VALUES,
  type IconSearchFilterType,
  type IconSearchType,
} from './icon-source.enum';

@ApiTags('icons')
@Controller('icons')
export class IconsController {
  constructor(private readonly iconsService: IconsService) {}

  @Get()
  @ApiOperation({
    summary: 'Search selectable icons',
    description: 'Searches by name across every icon category, or within one selected type.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search term (1-100 chars)' })
  @ApiQuery({
    name: 'ids',
    required: false,
    description: 'Comma-separated game icon ids. Cannot be combined with q or type.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ICON_SEARCH_TYPE_VALUES,
    description:
      'Optional single source/category. Omit it or use all to search every category; items is the item-only category.',
  })
  @ApiQuery({
    name: 'showUntradeables',
    required: false,
    enum: ['true', 'false'],
    description:
      'Only available when searching all categories or items. Defaults to false, which returns tradeable items only.',
  })
  @ApiOkResponse({
    description: 'Matching selectable icons',
    schema: {
      example: {
        data: [
          {
            id: 1,
            name: 'Magic spellbook',
            type: 'interface',
            iconPath: 'Spellbook.png',
            iconUrl: 'https://oldschool.runescape.wiki/images/Spellbook.png',
            iconSource: 'game_icon',
            lastSyncedAt: '2026-03-10T22:44:52.263Z',
            createdAt: '2026-03-10T22:44:52.263Z',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Missing or invalid query parameters' })
  async search(
    @Query('q') q?: string,
    @Query('ids') ids?: string,
    @Query('type') type?: string | string[],
    @Query('showUntradeables') showUntradeables?: string | string[],
  ) {
    if (ids !== undefined) {
      if (q !== undefined || type !== undefined || showUntradeables !== undefined) {
        throw new BadRequestException('ids cannot be combined with q, type or showUntradeables');
      }
      const iconIds = ids
        .split(',')
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isSafeInteger(value) && value > 0);
      if (iconIds.length === 0) {
        throw new BadRequestException('ids must contain at least one positive integer');
      }
      return { data: await this.iconsService.findByIds(iconIds) };
    }
    if (!q || q.trim().length === 0) {
      throw new BadRequestException('q is required');
    }
    if (q.length > 100) {
      throw new BadRequestException('q too long');
    }
    if (Array.isArray(type)) {
      throw new BadRequestException('type must contain exactly one option');
    }
    if (type !== undefined && !ICON_SEARCH_TYPE_VALUES.includes(type as IconSearchType)) {
      throw new BadRequestException(`type must be one of: ${ICON_SEARCH_TYPE_VALUES.join(', ')}`);
    }
    if (Array.isArray(showUntradeables)) {
      throw new BadRequestException('showUntradeables must contain exactly one value');
    }

    const normalizedType =
      type === undefined || type === 'all' ? undefined : type === 'items' ? 'item' : type;
    const searchesItems = normalizedType === undefined || normalizedType === 'item';
    if (showUntradeables !== undefined && !searchesItems) {
      throw new BadRequestException('showUntradeables is only available when type is all or items');
    }
    if (showUntradeables !== undefined && !['true', 'false', '1', '0'].includes(showUntradeables)) {
      throw new BadRequestException('showUntradeables must be true or false');
    }

    return {
      data: await this.iconsService.search(
        q.trim(),
        normalizedType as IconSearchFilterType | undefined,
        showUntradeables === 'true' || showUntradeables === '1',
      ),
    };
  }
}
