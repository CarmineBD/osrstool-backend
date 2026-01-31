import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

type CheckStatus = 'ok' | 'fail';
type OverallStatus = 'ok' | 'degraded';

interface DependencyCheck {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

export interface HealthResponse {
  status: OverallStatus;
  uptime: number;
  dependencies: {
    db: DependencyCheck;
    redis: DependencyCheck;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const timeoutMs = this.getTimeoutMs();
    const [db, redis] = await Promise.all([this.checkDb(timeoutMs), this.checkRedis(timeoutMs)]);

    const status: OverallStatus = db.status === 'ok' && redis.status === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      uptime: Math.floor(process.uptime()),
      dependencies: { db, redis },
    };
  }

  private getTimeoutMs(): number {
    const fromEnv = this.config.get<string>('HEALTH_CHECK_TIMEOUT_MS');
    const parsed = fromEnv ? Number(fromEnv) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  }

  private async checkDb(timeoutMs: number): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      await this.withTimeout(this.dataSource.query('SELECT 1'), timeoutMs);
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'fail', error: this.getErrorMessage(error) };
    }
  }

  private async checkRedis(timeoutMs: number): Promise<DependencyCheck> {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      return { status: 'fail', error: 'REDIS_URL not set' };
    }

    const start = Date.now();
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: timeoutMs,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });

    try {
      await this.withTimeout(redis.connect(), timeoutMs);
      await this.withTimeout(redis.ping(), timeoutMs);
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'fail', error: this.getErrorMessage(error) };
    } finally {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timeout'));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error('Unknown error'));
        });
    });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }
}
