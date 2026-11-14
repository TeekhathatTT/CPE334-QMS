import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { randomUUID } from 'crypto';

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const requestId = req.requestId || (typeof res.getHeader === 'function' ? (res.getHeader('X-Request-Id') as string) : undefined) || randomUUID();

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    });
    return;
  }

  // Handle SyntaxError from malformed JSON body
  if ('status' in err && (err as { status?: number }).status === 400 && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'Malformed JSON payload.',
        requestId,
      },
    });
    return;
  }

  // Generic internal server error (never leak raw stack or SQL errors)
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal server error occurred.',
      requestId,
    },
  });
}

