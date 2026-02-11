import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import {
  AchievementDiaryResponseDto,
  QuestResponseDto,
  QuestsQueryDto,
  SkillResponseDto,
} from './dto';

const CACHE_CONTROL_VALUE = 'public, max-age=86400';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('skills')
  @Header('Cache-Control', CACHE_CONTROL_VALUE)
  @ApiOperation({
    summary: 'List skills',
    description: 'Returns all skills ordered by name.',
  })
  @ApiOkResponse({ description: 'Skills list', type: SkillResponseDto, isArray: true })
  getSkills(): Promise<SkillResponseDto[]> {
    return this.catalogService.getSkills();
  }

  @Get('quests')
  @Header('Cache-Control', CACHE_CONTROL_VALUE)
  @ApiOperation({
    summary: 'List quests',
    description:
      'Returns quests ordered by name. When search has at least 2 characters, filters by name or slug.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search term (min 2 chars to filter)' })
  @ApiOkResponse({ description: 'Quests list', type: QuestResponseDto, isArray: true })
  getQuests(@Query() query: QuestsQueryDto): Promise<QuestResponseDto[]> {
    return this.catalogService.getQuests(query);
  }

  @Get('achievement-diaries')
  @Header('Cache-Control', CACHE_CONTROL_VALUE)
  @ApiOperation({
    summary: 'List achievement diaries',
    description: 'Returns all achievement diaries ordered by area, tier and name.',
  })
  @ApiOkResponse({
    description: 'Achievement diaries list',
    type: AchievementDiaryResponseDto,
    isArray: true,
  })
  getAchievementDiaries(): Promise<AchievementDiaryResponseDto[]> {
    return this.catalogService.getAchievementDiaries();
  }
}
