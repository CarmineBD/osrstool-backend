import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsISO8601 } from 'class-validator';

export class CreateItemDto {
  @IsInt()
  id: number;

  @IsString()
  name: string;

  @IsString()
  iconPath: string;

  @IsOptional()
  @IsString()
  examine?: string | null;

  @IsOptional()
  @IsInt()
  value?: number | null;

  @IsOptional()
  @IsInt()
  highAlch?: number | null;

  @IsOptional()
  @IsInt()
  lowAlch?: number | null;

  @IsOptional()
  @IsInt()
  buyLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  questItem?: boolean | null;

  @IsOptional()
  @IsBoolean()
  equipable?: boolean | null;

  @IsOptional()
  @IsBoolean()
  noteable?: boolean | null;

  @IsOptional()
  @IsBoolean()
  stackable?: boolean | null;

  @IsOptional()
  @IsNumber()
  weight?: number | null;

  @IsOptional()
  @IsBoolean()
  tradeable?: boolean | null;

  @IsOptional()
  @IsBoolean()
  members?: boolean | null;

  @IsOptional()
  @IsISO8601()
  lastSyncedAt?: string;
}
