import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { AchievementDiary } from './entities/achievement-diary.entity';
import { Quest } from './entities/quest.entity';
import { Skill } from './entities/skill.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AchievementDiary, Quest, Skill])],
  controllers: [CatalogsController],
  providers: [CatalogsService],
})
export class CatalogsModule {}
