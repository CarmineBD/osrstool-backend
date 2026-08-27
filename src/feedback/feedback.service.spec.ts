import { Logger, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { FeedbackStatus, FeedbackType } from './feedback.enums';
import { FeedbackNotificationService } from './feedback-notification.service';
import { FeedbackService } from './feedback.service';
import { Feedback } from './entities/feedback.entity';
import { User } from '../auth/entities/user.entity';

describe('FeedbackService', () => {
  const user = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    accountUsername: 'Carmine',
  } as User;
  const feedback = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: user.id,
    user,
    type: FeedbackType.FEATURE,
    content: 'Please add a feedback dashboard.',
    status: FeedbackStatus.NEW,
    createdAt: new Date('2026-08-25T12:00:00.000Z'),
  } as Feedback;

  const createService = () => {
    const feedbackRepoMock = {
      create: jest.fn((value: Partial<Feedback>) => value),
      save: jest.fn().mockResolvedValue(feedback),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
    };
    const feedbackRepo = feedbackRepoMock as unknown as Repository<Feedback>;
    const userRepoMock = {
      findOneBy: jest.fn().mockResolvedValue(user),
    };
    const userRepo = userRepoMock as unknown as Repository<User>;
    const notificationServiceMock = {
      assertConfigured: jest.fn(),
      sendNewFeedback: jest.fn().mockResolvedValue(undefined),
    };
    const notificationService = notificationServiceMock as unknown as FeedbackNotificationService;

    return {
      service: new FeedbackService(feedbackRepo, userRepo, notificationService),
      feedbackRepoMock,
      notificationServiceMock,
    };
  };

  it('stores new feedback and emails its complete content', async () => {
    const { service, feedbackRepoMock, notificationServiceMock } = createService();

    await expect(
      service.create(user.id, {
        type: FeedbackType.FEATURE,
        content: feedback.content,
      }),
    ).resolves.toEqual({
      id: feedback.id,
      type: FeedbackType.FEATURE,
      status: FeedbackStatus.NEW,
      createdAt: '2026-08-25T12:00:00.000Z',
      createdBy: { id: user.id, username: 'Carmine' },
      content: feedback.content,
    });
    expect(feedbackRepoMock.create).toHaveBeenCalledWith({
      userId: user.id,
      type: FeedbackType.FEATURE,
      content: feedback.content,
      status: FeedbackStatus.NEW,
    });
    expect(notificationServiceMock.assertConfigured).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.sendNewFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        content: feedback.content,
        createdBy: { id: user.id, username: 'Carmine' },
      }),
    );
  });

  it('persists feedback when notification delivery fails', async () => {
    const { service, feedbackRepoMock, notificationServiceMock } = createService();
    const error = new Error('SMTP unavailable');
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    notificationServiceMock.sendNewFeedback.mockRejectedValueOnce(error);

    try {
      await expect(
        service.create(user.id, {
          type: FeedbackType.FEATURE,
          content: feedback.content,
        }),
      ).resolves.toEqual(expect.objectContaining({ id: feedback.id }));
      await Promise.resolve();

      expect(feedbackRepoMock.save).toHaveBeenCalledTimes(1);
      expect(loggerError).toHaveBeenCalledWith(
        `Failed to send feedback notification for feedback=${feedback.id}`,
        error.stack,
      );
    } finally {
      loggerError.mockRestore();
    }
  });

  it('paginates feedback without content in the list', async () => {
    const { service, feedbackRepoMock } = createService();
    feedbackRepoMock.findAndCount.mockResolvedValue([[feedback], 3]);

    await expect(service.list({ page: 1, perPage: 2 })).resolves.toEqual({
      feedback: [
        {
          id: feedback.id,
          type: FeedbackType.FEATURE,
          status: FeedbackStatus.NEW,
          createdAt: '2026-08-25T12:00:00.000Z',
          createdBy: { id: user.id, username: 'Carmine' },
        },
      ],
      meta: { total: 3, page: 1, perPage: 2, hasNext: true },
    });
  });

  it('rejects a detail request for feedback that does not exist', async () => {
    const { service, feedbackRepoMock } = createService();
    feedbackRepoMock.findOne.mockResolvedValue(null);

    await expect(service.findOne(feedback.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
