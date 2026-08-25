import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FeedbackType } from '../feedback.enums';

export class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackType, example: FeedbackType.FEATURE })
  @IsEnum(FeedbackType)
  type: FeedbackType;

  @ApiProperty({ minLength: 10, maxLength: 5000, example: 'It would be useful to add...' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(10, 5000)
  content: string;
}
