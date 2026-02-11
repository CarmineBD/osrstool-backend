import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementDiary } from './entities/achievement-diary.entity';
import { Quest } from './entities/quest.entity';
import { Skill } from './entities/skill.entity';

@Injectable()
export class CatalogsService {
  constructor(
    @InjectRepository(AchievementDiary)
    private readonly achievementDiaryRepo: Repository<AchievementDiary>,
    @InjectRepository(Quest)
    private readonly questRepo: Repository<Quest>,
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
  ) {}

  async findAllAchievementDiaries(): Promise<
    Array<Pick<AchievementDiary, 'id' | 'region' | 'tier'>>
  > {
    return this.achievementDiaryRepo.find({
      select: { id: true, region: true, tier: true },
      order: { id: 'ASC' },
    });
  }

  async findAllQuests(): Promise<Array<Pick<Quest, 'id' | 'name' | 'slug'>>> {
    return this.questRepo.find({
      select: { id: true, name: true, slug: true },
      order: { id: 'ASC' },
    });
  }

  async findAllSkills(): Promise<Array<Pick<Skill, 'id' | 'name' | 'key'>>> {
    return this.skillRepo.find({
      select: { id: true, name: true, key: true },
      order: { id: 'ASC' },
    });
  }
}
