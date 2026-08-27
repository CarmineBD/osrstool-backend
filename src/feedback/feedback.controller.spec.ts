import 'reflect-metadata';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

describe('FeedbackController', () => {
  it('limits feedback creation to five submissions per hour', () => {
    const controller = new FeedbackController({} as FeedbackService);
    const handler = Object.getOwnPropertyDescriptor(FeedbackController.prototype, 'create')
      ?.value as object;
    const limit = Reflect.getMetadata(THROTTLER_LIMIT + 'default', handler) as number;
    const ttl = Reflect.getMetadata(THROTTLER_TTL + 'default', handler) as number;

    expect(controller).toBeDefined();
    expect(limit).toBe(5);
    expect(ttl).toBe(60 * 60 * 1000);
  });
});
