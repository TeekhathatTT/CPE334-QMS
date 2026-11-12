import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AccountStatus } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors/AppError';
import { verifyPassword } from '../auth/password';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  clearCookieOptions,
  createSession,
  csrfCookieOptions,
  deleteSessionById,
  deleteSessionByToken,
  sessionCookieOptions,
} from '../auth/session';
import { requireAuth } from '../middleware/auth';
import { requireCsrf } from '../middleware/csrf';
import { validateRequest } from '../middleware/validateRequest';

export const authRouter = Router();

// One message for unknown email, wrong password, and DISABLED account (FR-01).
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

const loginBodySchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };

// POST /api/auth/login (api-spec §6.1) — anonymous, no CSRF token required.
authRouter.post(
  '/login',
  validateRequest({ body: loginBodySchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginBodySchema>;
    const normalizedEmail = email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true, accountStatus: true, passwordHash: true },
    });

    // verifyPassword always runs one bcrypt comparison so timing does not reveal account existence.
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !passwordMatches || user.accountStatus !== AccountStatus.ACTIVE) {
      throw new AppError(401, 'UNAUTHORIZED', INVALID_CREDENTIALS_MESSAGE);
    }

    // Prevent session fixation: discard any session presented with this request.
    await deleteSessionByToken(req.cookies?.[SESSION_COOKIE]);

    const session = await createSession(user.id);
    res.cookie(SESSION_COOKIE, session.rawToken, sessionCookieOptions(session.expiresAt));
    res.cookie(CSRF_COOKIE, session.csrfToken, csrfCookieOptions(session.expiresAt));

    res.status(200).json({ data: { user: { id: user.id, email: user.email, role: user.role } } });
  })
);

// POST /api/auth/logout (api-spec §6.2) — session + CSRF required, 204 with no body.
authRouter.post(
  '/logout',
  requireAuth,
  requireCsrf,
  asyncHandler(async (req, res) => {
    await deleteSessionById(req.authSession!.id);
    res.clearCookie(SESSION_COOKIE, clearCookieOptions(true));
    res.clearCookie(CSRF_COOKIE, clearCookieOptions(false));
    res.status(204).end();
  })
);

// GET /api/auth/me (api-spec §6.3). Re-issues the CSRF cookie so a reloaded page can always send it.
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const session = req.authSession!;
  const user = req.user!;
  res.cookie(CSRF_COOKIE, session.csrfToken, csrfCookieOptions(session.expiresAt));
  res.status(200).json({ data: { user: { id: user.id, email: user.email, role: user.role } } });
});
