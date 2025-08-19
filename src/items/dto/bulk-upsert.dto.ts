import { IsArray, IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ItemUpsertDto } from './item-upsert.dto';

export class BulkUpsertDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemUpsertDto)
  items: ItemUpsertDto[];

  @IsOptional()
  @IsBoolean()
  touchLastSyncedAt?: boolean;
}
