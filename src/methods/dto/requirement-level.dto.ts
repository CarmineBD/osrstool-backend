import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { TrimLowercaseString } from './transforms';
import { REQUIREMENT_SKILL_KEY_VALUES, type RequirementSkillKeyValue } from './skill.constants';
import { REASON_MAX_LENGTH } from './validation.constants';
import { IsValidRequirementLevel } from './validators/requirement-level-range.validator';

export class RequirementLevelDto {
  @TrimLowercaseString()
  @IsEnum(REQUIREMENT_SKILL_KEY_VALUES)
  skill: RequirementSkillKeyValue;

  @IsInt()
  @IsValidRequirementLevel()
  level: number;

  @IsOptional()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH)
  @IsSafeMarkdown()
  reason?: string;
}
