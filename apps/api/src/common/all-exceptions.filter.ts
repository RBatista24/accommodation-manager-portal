import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * One error shape for the whole API: { statusCode, message, error }.
 * Known database errors become meaningful HTTP errors; anything unexpected is
 * logged in full and returned as a generic message (no internals leak out).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, message, details } = this.translate(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    response
      .status(status)
      .json({ statusCode: status, message, error: HttpStatus[status] ?? 'Error', ...(details !== undefined ? { details } : {}) });
  }

  private translate(exception: unknown): { status: number; message: string | string[]; details?: unknown } {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: string | string[] }).message
          : exception.message;
      // Structured, safe extra data a client can act on (e.g. the overlapping stays of a 409).
      const details = typeof body === 'object' && body !== null && 'details' in body ? (body as { details: unknown }).details : undefined;
      return { status: exception.getStatus(), message, details };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return { status: HttpStatus.CONFLICT, message: 'This already exists.' };
        case 'P2003':
          return { status: HttpStatus.CONFLICT, message: 'This is still referenced by other records.' };
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, message: 'Not found.' };
      }
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Something went wrong. Please try again.' };
  }
}
