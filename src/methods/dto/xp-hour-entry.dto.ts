import { IsNumber, IsString } from 'class-validator';

export class XpHourEntryDto {
  @IsString()
  skill: string;

  @IsNumber()
  experience: number;
}
