import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { FeedbackController } from './feedback.controller';
import { FeedbackNotificationService } from './feedback-notification.service';
import { FeedbackService } from './feedback.service';
import { Feedback } from './entities/feedback.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Feedback, User])],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackNotificationService],
})
export class FeedbackModule {}
