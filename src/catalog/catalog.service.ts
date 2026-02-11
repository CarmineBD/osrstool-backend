import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AchievementDiaryResponseDto,
  QuestResponseDto,
  QuestsQueryDto,
  SkillResponseDto,
} from './dto';
import { AchievementDiary } from './entities/achievement-diary.entity';
import { Quest } from './entities/quest.entity';
import { Skill } from './entities/skill.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
    @InjectRepository(Quest)
    private readonly questRepo: Repository<Quest>,
    @InjectRepository(AchievementDiary)
    private readonly achievementDiaryRepo: Repository<AchievementDiary>,
  ) {}

  async getSkills(): Promise<SkillResponseDto[]> {
    const skills = await this.skillRepo.find({
      select: { id: true, name: true, key: true },
      order: { name: 'ASC' },
    });

    return skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      key: skill.key,
    }));
  }

  async getQuests(query: QuestsQueryDto): Promise<QuestResponseDto[]> {
    const search = query.search?.trim();
    const qb = this.questRepo
      .createQueryBuilder('quest')
      .select(['quest.id', 'quest.name', 'quest.slug'])
      .orderBy('quest.name', 'ASC');

    if (search && search.length >= 2) {
      qb.where('quest.name ILIKE :search OR quest.slug ILIKE :search', {
        search: `%${search}%`,
      });
    }

    const quests = await qb.getMany();
    return quests.map((quest) => ({
      id: quest.id,
      name: quest.name,
      slug: quest.slug,
    }));
  }

  async getAchievementDiaries(): Promise<AchievementDiaryResponseDto[]> {
    const diaries = await this.achievementDiaryRepo.find({
      select: { id: true, area: true, tier: true, name: true, slug: true },
      order: { area: 'ASC', tier: 'ASC', name: 'ASC' },
    });

    return diaries.map((diary) => ({
      id: diary.id,
      area: diary.area,
      tier: diary.tier,
      name: diary.name,
      slug: diary.slug,
    }));
  }
}
