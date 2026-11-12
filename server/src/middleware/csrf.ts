import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { safeEqual } from '../auth/session';

export const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Requires `X-CSRF-Token` to match the CSRF token stored with the caller's session
 * (api-spec §4.1, §4.3). Mount after `requireAuth` so a missing session is `401`, and before
 * any validation or handler so a rejected request never reaches the mutation.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (!req.user || !req.authSession) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'));
  }

  const provided = req.get(CSRF_HEADER);
  if (!provided || !safeEqual(provided, req.authSession.csrfToken)) {
    return next(new AppError(403, 'FORBIDDEN', 'The request could not be verified.'));
  }

  next();
}
