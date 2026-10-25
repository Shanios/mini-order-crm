import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientKnownRequestError
      || exception instanceof Prisma.PrismaClientUnknownRequestError
      || exception instanceof Prisma.PrismaClientInitializationError
      || exception instanceof Prisma.PrismaClientRustPanicError) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'The database request could not be completed.',
        },
      } satisfies ApiErrorBody);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Preserve the established /api/health response on a database outage.
      if (isHealthFailure(exceptionResponse)) {
        response.status(status).json(exceptionResponse);
        return;
      }

      if (isApiError(exceptionResponse)) {
        response.status(status).json({ error: exceptionResponse });
        return;
      }

      const code = status === HttpStatus.BAD_REQUEST
        ? 'VALIDATION_ERROR'
        : status === HttpStatus.NOT_FOUND
          ? 'NOT_FOUND'
          : 'REQUEST_FAILED';
      const message = status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? 'The request could not be completed.'
        : safeHttpMessage(exceptionResponse);

      response.status(status).json({ error: { code, message } } satisfies ApiErrorBody);
      return;
    }

    // Do not serialize arbitrary exception text; it can contain SQL or connection details.
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'The request could not be completed.',
      },
    } satisfies ApiErrorBody);
  }
}

function isApiError(value: string | object): value is { code: string; message: string } {
  return typeof value === 'object'
    && value !== null
    && 'code' in value
    && typeof value.code === 'string'
    && 'message' in value
    && typeof value.message === 'string';
}

function isHealthFailure(value: string | object): value is { status: string; database: string } {
  return typeof value === 'object'
    && value !== null
    && 'status' in value
    && value.status === 'error'
    && 'database' in value
    && value.database === 'disconnected';
}

function safeHttpMessage(value: string | object): string {
  if (typeof value === 'string') return value;
  if ('message' in value) {
    return Array.isArray(value.message) ? value.message.join(', ') : String(value.message);
  }
  return 'The request could not be completed.';
}
