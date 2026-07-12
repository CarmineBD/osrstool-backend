import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface ParsedException {
  status: number;
  code: number | string;
  message: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const parsed = this.parseException(exception);

    response.status(parsed.status).json({
      status: 'error',
      error: {
        code: parsed.code,
        message: parsed.message,
        details: parsed.details,
      },
    });
  }

  private parseException(exception: unknown): ParsedException {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const rawResponse = exception.getResponse();
      return {
        status,
        code: status,
        message: this.extractMessage(rawResponse) ?? 'Internal server error',
        details: this.extractDetails(rawResponse),
      };
    }

    const payloadTooLarge = this.parsePayloadTooLargeException(exception);
    if (payloadTooLarge) {
      return payloadTooLarge;
    }

    const invalidJson = this.parseInvalidJsonException(exception);
    if (invalidJson) {
      return invalidJson;
    }

    const queryFailed = this.parseQueryFailedException(exception);
    if (queryFailed) {
      return queryFailed;
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'UNEXPECTED_ERROR',
      message: 'Internal server error',
    };
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

  private parsePayloadTooLargeException(exception: unknown): ParsedException | null {
    if (!this.isRecord(exception)) return null;

    const type = typeof exception.type === 'string' ? exception.type : undefined;
    const status =
      this.toFiniteNumber(exception.status) ?? this.toFiniteNumber(exception.statusCode);
    if (type !== 'entity.too.large' && status !== HttpStatus.PAYLOAD_TOO_LARGE) {
      return null;
    }

    const limit = this.toFiniteNumber(exception.limit);
    const length = this.toFiniteNumber(exception.length);
    const details =
      limit != null || length != null
        ? {
            ...(length != null ? { receivedBytes: length } : {}),
            ...(limit != null ? { limitBytes: limit } : {}),
          }
        : undefined;

    let message = 'Request body too large.';
    if (length != null && limit != null) {
      message = `Request body too large. Received ${length} bytes, limit is ${limit} bytes.`;
    } else if (limit != null) {
      message = `Request body too large. Limit is ${limit} bytes.`;
    }

    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      code: 'PAYLOAD_TOO_LARGE',
      message,
      details,
    };
  }

  private parseInvalidJsonException(exception: unknown): ParsedException | null {
    if (!this.isRecord(exception)) return null;

    const type = typeof exception.type === 'string' ? exception.type : undefined;
    const status =
      this.toFiniteNumber(exception.status) ?? this.toFiniteNumber(exception.statusCode);
    if (type !== 'entity.parse.failed' && status !== HttpStatus.BAD_REQUEST) {
      return null;
    }

    if (!(exception instanceof SyntaxError) && type !== 'entity.parse.failed') {
      return null;
    }

    return {
      status: HttpStatus.BAD_REQUEST,
      code: 'INVALID_JSON',
      message: 'Malformed JSON request body',
    };
  }

  private parseQueryFailedException(exception: unknown): ParsedException | null {
    if (!(exception instanceof QueryFailedError)) return null;

    const driverError = this.isRecord(exception.driverError) ? exception.driverError : {};
    const postgresCode = typeof driverError.code === 'string' ? driverError.code : undefined;
    const detail = typeof driverError.detail === 'string' ? driverError.detail : undefined;
    const constraint =
      typeof driverError.constraint === 'string' ? driverError.constraint : undefined;
    const column = typeof driverError.column === 'string' ? driverError.column : undefined;

    switch (postgresCode) {
      case '22001':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'VALUE_TOO_LONG',
          message:
            detail ??
            (column
              ? `Value too long for column "${column}".`
              : 'One of the provided values is too long.'),
        };
      case '22P02':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'INVALID_VALUE',
          message: detail ?? 'One of the provided values has an invalid format.',
        };
      case '23503':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'FOREIGN_KEY_VIOLATION',
          message:
            detail ??
            (constraint
              ? `Referenced record does not exist for constraint "${constraint}".`
              : 'Referenced record does not exist.'),
        };
      case '23505':
        return {
          status: HttpStatus.CONFLICT,
          code: 'UNIQUE_VIOLATION',
          message:
            detail ??
            (constraint
              ? `Duplicate value violates constraint "${constraint}".`
              : 'Duplicate value violates a unique constraint.'),
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'QUERY_FAILED',
          message: detail ?? exception.message,
        };
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toFiniteNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return value;
  }
}
