import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { USERNAME_MAX_LENGTH } from './validation.constants';
import type { UserInfo } from '../types';

export class PlayerInfoDto implements UserInfo {
  @ApiProperty({ type: Object, example: { Cooking: 99, Magic: 85 } })
  @IsObject()
  levels!: Record<string, number>;

  @ApiProperty({
    type: Object,
    example: { cooking: 13034431, magic: 4250000 },
    description: 'Exact skill experience from the OSRS Hiscores.',
  })
  @IsObject()
  experience!: Record<string, number>;

  @ApiProperty({ type: Object, example: { "Cook's Assistant": 2 } })
  @IsObject()
  quests!: Record<string, number>;

  @ApiProperty({ type: Object })
  @IsObject()
  achievement_diaries!: UserInfo['achievement_diaries'];
}

export class PlayerLookupDto {
  @ApiProperty({
    description: 'RuneScape player username',
    example: 'zezima',
    maxLength: USERNAME_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USERNAME_MAX_LENGTH)
  username!: string;
}

export class PlayerContextDto {
  @ApiPropertyOptional({
    type: PlayerInfoDto,
    description: 'Player information previously returned by POST /player/info',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlayerInfoDto)
  player?: PlayerInfoDto;
}
