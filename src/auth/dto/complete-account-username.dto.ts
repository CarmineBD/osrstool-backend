import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class CompleteAccountUsernameDto {
  @ApiProperty({
    example: 'osrs_user_1',
    description:
      'Account username to set once for the authenticated profile. It is trimmed and normalized to lowercase before validation and storage.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 20)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_]{2,19}$/, {
    message:
      'username must start with a letter or number and contain only letters, numbers, and underscores',
  })
  username: string;
}
