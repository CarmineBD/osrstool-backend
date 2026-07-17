import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { SKILL_KEY_VALUES } from './skill.constants';
import { MAX_XP_PER_HOUR } from './validation.constants';
import { TrimString } from './transforms';

const SKILL_KEY_PATTERN = new RegExp(`^(${SKILL_KEY_VALUES.join('|')})$`, 'i');

export class XpHourEntryDto {
  @TrimString()
  @IsString()
  @Matches(SKILL_KEY_PATTERN)
  skill: string;

  @IsInt()
  @Min(0)
  @Max(MAX_XP_PER_HOUR)
  experience: number;
}
