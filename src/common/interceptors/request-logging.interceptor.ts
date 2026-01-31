import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { method?: string; originalUrl?: string }>();
    const response = http.getResponse<{ statusCode?: number }>();

    const method = request?.method ?? 'UNKNOWN';
    const url = request?.originalUrl ?? 'unknown';
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - startedAt;
          const statusCode = response?.statusCode ?? 0;
          this.logger.log(`${method} ${url} ${statusCode} ${ms}ms`);
        },
        error: (err) => {
          const ms = Date.now() - startedAt;
          const statusCode = response?.statusCode ?? 0;
          const message = err instanceof Error ? err.message : 'Unknown error';
          this.logger.error(`${method} ${url} ${statusCode} ${ms}ms - ${message}`);
        },
      }),
    );
  }
}
