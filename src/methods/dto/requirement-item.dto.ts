import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { IsSafeMarkdown } from '../../common/validators/is-safe-markdown.validator';
import {
  MAX_ITEM_QUANTITY,
  MAX_ITEM_QUANTITY_DECIMAL_PLACES,
  REASON_MAX_LENGTH,
} from './validation.constants';

export class RequirementItemDto {
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
  @IsString()
  @MaxLength(REASON_MAX_LENGTH)
  @IsSafeMarkdown()
  reason?: string;
}
