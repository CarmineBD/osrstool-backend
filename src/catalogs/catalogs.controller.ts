import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogsService } from './catalogs.service';

const ACHIEVEMENT_DIARY_EXAMPLE = {
  id: 1,
  region: 'Ardougne',
  tier: 'easy',
};

const QUEST_EXAMPLE = {
  id: 1,
  name: "Cook's Assistant",
  slug: 'cooks-assistant',
};

const SKILL_EXAMPLE = {
  id: 1,
  name: 'Attack',
  key: 'attack',
};

@ApiTags('catalogs')
@Controller()
export class CatalogsController {
  constructor(private readonly svc: CatalogsService) {}

  @Get('achievement-diaries')
  @ApiOperation({
    summary: 'List achievement diaries',
    description: 'Returns all achievement diaries.',
  })
  @ApiOkResponse({
    description: 'Achievement diaries list',
    schema: { example: [ACHIEVEMENT_DIARY_EXAMPLE] },
  })
  async getAchievementDiaries() {
    return this.svc.findAllAchievementDiaries();
  }

  @Get('quests')
  @ApiOperation({ summary: 'List quests', description: 'Returns all quests.' })
  @ApiOkResponse({
    description: 'Quests list',
    schema: { example: [QUEST_EXAMPLE] },
  })
  async getQuests() {
    return this.svc.findAllQuests();
  }

  @Get('skills')
  @ApiOperation({ summary: 'List skills', description: 'Returns all skills.' })
  @ApiOkResponse({
    description: 'Skills list',
    schema: { example: [SKILL_EXAMPLE] },
  })
  async getSkills() {
    return this.svc.findAllSkills();
  }
}
