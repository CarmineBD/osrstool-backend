import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackListQueryDto } from './dto/feedback-list-query.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackNotificationService } from './feedback-notification.service';
import { FeedbackStatus } from './feedback.enums';
import { Feedback } from './entities/feedback.entity';

export interface FeedbackResponse {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  createdBy: {
    id: string;
    username: string;
  };
  content?: string;
}

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepo: Repository<Feedback>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: FeedbackNotificationService,
  ) {}

  async create(userId: string, dto: CreateFeedbackDto): Promise<FeedbackResponse> {
    this.notificationService.assertConfigured();

    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user?.accountUsername) {
      throw new NotFoundException('Feedback creator was not found');
    }

    const feedback = await this.feedbackRepo.save(
      this.feedbackRepo.create({
        userId,
        type: dto.type,
        content: dto.content,
        status: FeedbackStatus.NEW,
      }),
    );
    const response = this.toResponse({ ...feedback, user }, true);

    await this.notificationService.sendNewFeedback({
      id: feedback.id,
      type: feedback.type,
      content: feedback.content,
      status: feedback.status,
      createdAt: feedback.createdAt,
      createdBy: {
        id: user.id,
        username: user.accountUsername,
      },
    });

    return response;
  }

  async list(query: FeedbackListQueryDto) {
    const [feedback, total] = await this.feedbackRepo.findAndCount({
      relations: { user: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    });

    return {
      feedback: feedback.map((item) => this.toResponse(item, false)),
      meta: {
        total,
        page: query.page,
        perPage: query.perPage,
        hasNext: query.page * query.perPage < total,
      },
    };
  }

  async findOne(id: string): Promise<FeedbackResponse> {
    const feedback = await this.feedbackRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return this.toResponse(feedback, true);
  }

  async updateStatus(id: string, dto: UpdateFeedbackStatusDto): Promise<FeedbackResponse> {
    const feedback = await this.feedbackRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    feedback.status = dto.status;
    const updated = await this.feedbackRepo.save(feedback);
    return this.toResponse(updated, true);
  }

  private toResponse(feedback: Feedback, includeContent: boolean): FeedbackResponse {
    const username = feedback.user?.accountUsername;
    if (!username) {
      throw new NotFoundException('Feedback creator was not found');
    }

    return {
      id: feedback.id,
      type: feedback.type,
      status: feedback.status,
      createdAt: feedback.createdAt.toISOString(),
      createdBy: {
        id: feedback.userId,
        username,
      },
      ...(includeContent ? { content: feedback.content } : {}),
    };
  }
}
