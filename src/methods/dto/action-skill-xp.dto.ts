import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ActionCondition } from '../action-condition.enum';
import { MAX_XP_PER_HOUR } from './validation.constants';

export class ActionSkillXpDto {
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsInt()
  @Min(1)
  skillId: number;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 6 })
  @Min(0)
  @Max(MAX_XP_PER_HOUR)
  experience: number;

  @IsOptional()
  @IsEnum(ActionCondition)
  condition?: ActionCondition;
}
