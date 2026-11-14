import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// Accept a caller-supplied correlation ID only if it is short and uses a safe character set,
// so it cannot inject content into logs or response headers.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header('X-Request-Id')?.trim();
  const requestId = incomingRequestId && SAFE_REQUEST_ID.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

