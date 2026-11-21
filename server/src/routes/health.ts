import express, { Request, Response } from 'express';
import { prisma } from '../db';

export const healthRouter = express.Router();

/**
 * The running release, for checking which commit is deployed. Only this one value is ever
 * echoed from the environment: COMMIT_SHA (set by CI / the platform), then APP_VERSION,
 * then "unknown".
 */
export function resolveVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.COMMIT_SHA?.trim() || env.APP_VERSION?.trim() || 'unknown';
}

/**
 * GET /api/health
 * Public liveness/readiness check: no session, no CSRF (GET), and no data access beyond a
 * single read-only `SELECT 1`. A failing database answers 503 with a fixed body; the real
 * error is logged server-side only and never returned to the caller.
 */
healthRouter.get('/', async (req: Request, res: Response) => {
  const version = resolveVersion();
  res.setHeader('Cache-Control', 'no-store');

  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok', database: 'ok', version });
  } catch (err) {
    console.error('[Health] database check failed', { requestId: req.requestId }, err);
    res.status(503).json({ status: 'degraded', database: 'unavailable', version });
  }
});
