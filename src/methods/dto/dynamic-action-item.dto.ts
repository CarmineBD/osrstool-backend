import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ActionCondition } from '../action-condition.enum';
import { MAX_ITEM_QUANTITY, MAX_ITEM_QUANTITY_DECIMAL_PLACES } from './validation.constants';

export class DynamicActionItemDto {
  @IsInt()
  @Min(1)
  id: number;

  @IsNumber({
    allowInfinity: false,
    allowNaN: false,
    maxDecimalPlaces: MAX_ITEM_QUANTITY_DECIMAL_PLACES,
  })
  @Min(0)
  @Max(MAX_ITEM_QUANTITY)
  quantity: number;

  @IsOptional()
  @IsEnum(ActionCondition)
  condition?: ActionCondition;
}
