import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import { RequirementStage } from './requirement-stage.enum';
import { TrimString } from './transforms';
import { QUEST_NAME_MAX_LENGTH, REASON_MAX_LENGTH } from './validation.constants';

export class RequirementQuestDto {
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(QUEST_NAME_MAX_LENGTH)
  name: string;

  @IsEnum(RequirementStage)
  stage: RequirementStage;

  @IsOptional()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH)
  @IsSafeMarkdown()
  reason?: string;
}
