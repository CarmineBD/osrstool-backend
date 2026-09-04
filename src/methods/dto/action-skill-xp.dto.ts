import { IsInt, IsNumber, Max, Min } from 'class-validator';
import { MAX_XP_PER_HOUR } from './validation.constants';

export class ActionSkillXpDto {
  @IsInt()
  @Min(1)
  skillId: number;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 })
  @Min(0)
  @Max(MAX_XP_PER_HOUR)
  experience: number;
}
