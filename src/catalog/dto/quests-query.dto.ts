import { IsOptional, IsString, MaxLength } from 'class-validator';

export class QuestsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
