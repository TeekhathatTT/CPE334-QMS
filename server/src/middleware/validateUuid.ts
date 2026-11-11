import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuidV4(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

export function validateUuidParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction, value: string): void => {
    if (!isValidUuidV4(value)) {
      return next(new AppError(400, 'INVALID_ARGUMENT', `Malformed ${paramName} parameter. Must be a valid UUIDv4.`));
    }
    next();
  };
}

export function validateUuidMiddleware(req: Request, res: Response, next: NextFunction): void {
  for (const [key, value] of Object.entries(req.params)) {
    if ((key === 'queueId' || key === 'entryId' || key.toLowerCase().endsWith('id')) && typeof value === 'string') {
      if (!isValidUuidV4(value)) {
        return next(new AppError(400, 'INVALID_ARGUMENT', `Malformed ${key} parameter. Must be a valid UUIDv4.`));
      }
    }
  }
  next();
}

