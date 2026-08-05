import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';
import { OptionalSupabaseAuthGuard } from '../auth/optional-supabase-auth.guard';

describe('PresenceController', () => {
  const createController = () => {
    const presenceService = {
      recordHeartbeat: jest.fn<Promise<number>, [unknown]>(),
      getOnlineCount: jest.fn<Promise<number>, []>(),
    };

    const controller = new PresenceController(presenceService as unknown as PresenceService);
    return { controller, presenceService };
  };

  it('returns only the online count for heartbeat', async () => {
    const { controller, presenceService } = createController();
    const recordHeartbeat = presenceService.recordHeartbeat;
    recordHeartbeat.mockResolvedValue(127);

    const result = await controller.heartbeat({ visitorId: 'visitor-1' }, {
      user: undefined,
    } as never);

    expect(recordHeartbeat).toHaveBeenCalledWith({
      authenticatedUserId: undefined,
      visitorId: 'visitor-1',
    });
    expect(result).toEqual({ online: 127 });
    expect((result as unknown as Record<string, unknown>).visitorId).toBeUndefined();
  });

  it('returns only the online count for the public query endpoint', async () => {
    const { controller, presenceService } = createController();
    const getOnlineCount = presenceService.getOnlineCount;
    getOnlineCount.mockResolvedValue(321);

    await expect(controller.getOnline()).resolves.toEqual({ online: 321 });
  });

  it('uses optional auth for heartbeat', () => {
    const handler = Object.getOwnPropertyDescriptor(PresenceController.prototype, 'heartbeat')
      ?.value as object;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).toEqual([OptionalSupabaseAuthGuard]);
  });

  it('sets a dedicated throttle limit for heartbeat', () => {
    const handler = Object.getOwnPropertyDescriptor(PresenceController.prototype, 'heartbeat')
      ?.value as object;
    const limit = Reflect.getMetadata(THROTTLER_LIMIT + 'default', handler) as number;
    const ttl = Reflect.getMetadata(THROTTLER_TTL + 'default', handler) as number;

    expect(limit).toBe(10);
    expect(ttl).toBe(60);
  });
});
