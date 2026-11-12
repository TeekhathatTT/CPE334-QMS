import { Request, Response, NextFunction } from 'express';
import { findActiveSession, SESSION_COOKIE } from '../auth/session';

declare global {
  namespace Express {
    interface Request {
      /** The server-side session behind `req.user`, set by `loadSession`. */
      authSession?: { id: string; csrfToken: string; expiresAt: Date };
    }
  }
}

/**
 * Resolves the `qms_session` cookie into `req.user` / `req.authSession`.
 *
 * It never rejects a request: a missing, unknown, expired, or DISABLED-user session simply
 * leaves `req.user` unset, and `requireAuth` turns that into `401 UNAUTHORIZED`.
 */
export async function loadSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await findActiveSession(req.cookies?.[SESSION_COOKIE]);
    if (session) {
      req.user = session.user;
      req.authSession = { id: session.id, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
    }
    next();
  } catch (err) {
    next(err);
  }
}
