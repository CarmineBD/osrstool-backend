import { Type } from 'class-transformer';
import { Allow, ArrayMaxSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { RequirementAchievementDiaryDto } from './requirement-achievement-diary.dto';
import { RequirementItemDto } from './requirement-item.dto';
import { RequirementLevelDto } from './requirement-level.dto';
import { RequirementQuestDto } from './requirement-quest.dto';
import { REQUIREMENT_ENTRIES_MAX_COUNT } from './validation.constants';

export class VariantRequirementsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REQUIREMENT_ENTRIES_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => RequirementItemDto)
  items?: RequirementItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REQUIREMENT_ENTRIES_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => RequirementLevelDto)
  levels?: RequirementLevelDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REQUIREMENT_ENTRIES_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => RequirementQuestDto)
  quests?: RequirementQuestDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REQUIREMENT_ENTRIES_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => RequirementAchievementDiaryDto)
  achievement_diaries?: RequirementAchievementDiaryDto[];

  @IsOptional()
  @Allow()
  miniquests?: unknown;

  @IsOptional()
  @Allow()
  minigames?: unknown;

  @IsOptional()
  @Allow()
  events?: unknown;

  @IsOptional()
  @Allow()
  meta?: unknown;
}
