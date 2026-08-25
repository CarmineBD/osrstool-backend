import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { FeedbackStatus } from '../feedback.enums';

export class UpdateFeedbackStatusDto {
  @ApiProperty({ enum: FeedbackStatus, example: FeedbackStatus.CONSIDERING })
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;
}
