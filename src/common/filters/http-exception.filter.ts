import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse = isHttpException ? exception.getResponse() : null;
    const message = this.extractMessage(rawResponse) ?? 'Internal server error';
    const details = this.extractDetails(rawResponse);

    response.status(status).json({
      status: 'error',
      error: {
        code: isHttpException ? status : 'UNEXPECTED_ERROR',
        message,
        details,
      },
    });
  }

  private extractMessage(rawResponse: unknown): string | undefined {
    if (!rawResponse) return undefined;
    if (typeof rawResponse === 'string') return rawResponse;
    if (typeof rawResponse === 'object' && rawResponse !== null) {
      const value = (rawResponse as { message?: unknown }).message;
      if (Array.isArray(value)) return value.join('; ');
      if (typeof value === 'string') return value;
    }
    return undefined;
  }

  private extractDetails(rawResponse: unknown): unknown {
    if (!rawResponse || typeof rawResponse !== 'object') return undefined;
    const value = (rawResponse as { message?: unknown }).message;
    if (Array.isArray(value)) return value;
    return undefined;
  }
}
