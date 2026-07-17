import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import {
  ACHIEVEMENT_DIARY_TIER_VALUES,
  type AchievementDiaryTierValue,
} from './achievement-diary-tier.constants';
import { RequirementStage } from './requirement-stage.enum';
import { TrimLowercaseString, TrimString } from './transforms';
import { ACHIEVEMENT_DIARY_NAME_MAX_LENGTH, REASON_MAX_LENGTH } from './validation.constants';

export class RequirementAchievementDiaryDto {
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(ACHIEVEMENT_DIARY_NAME_MAX_LENGTH)
  name: string;

  @TrimLowercaseString()
  @IsEnum(ACHIEVEMENT_DIARY_TIER_VALUES)
  tier: AchievementDiaryTierValue;

  @IsOptional()
  @IsEnum(RequirementStage)
  stage?: RequirementStage;

  @IsOptional()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH)
  @IsSafeMarkdown()
  reason?: string;
}
