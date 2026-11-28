import express, { Request, Response, NextFunction } from 'express';
import { QueuePriority, Role } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireCsrf } from '../middleware/csrf';
import { validateUuidParam } from '../middleware/validateUuid';
import { listOpenQueues, joinQueue } from '../services/queueService';

export const queuesRouter = express.Router();

queuesRouter.param('queueId', validateUuidParam('queueId'));

/**
 * GET /api/queues
 * Lists all OPEN queues (api-spec §7.1).
 * Allowed roles: CUSTOMER, OPERATOR. Anonymous users receive 401 UNAUTHORIZED.
 */
queuesRouter.get(
  '/',
  requireAuth,
  requireRole(Role.CUSTOMER, Role.OPERATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queues = await listOpenQueues();
      res.status(200).json({
        data: {
          queues,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/queues/:queueId/entries
 * Joins an OPEN queue and allocates the next monotonic queue number (api-spec §7.2).
 * Allowed role: CUSTOMER only. Requires CSRF protection.
 */
queuesRouter.post(
  '/:queueId/entries',
  requireAuth,
  requireRole(Role.CUSTOMER),
  requireCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // F-10 (FR-20, BR-21, api-spec §18): reject customer self-elevation (403) and malformed
      // priority (400) strictly before any DB lookup. Empty/omitted body or literal "NORMAL" proceeds.
      if (
        req.body !== undefined &&
        req.body !== null &&
        typeof req.body === 'object' &&
        Object.prototype.hasOwnProperty.call(req.body, 'priority') &&
        (req.body as Record<string, unknown>).priority !== undefined
      ) {
        const requestedPriority = (req.body as Record<string, unknown>).priority;
        if (requestedPriority === QueuePriority.PRIORITY) {
          return next(new AppError(403, 'FORBIDDEN', 'Customers cannot set queue priority.'));
        }
        if (requestedPriority !== QueuePriority.NORMAL) {
          return next(new AppError(400, 'INVALID_ARGUMENT', 'Invalid priority value.'));
        }
      }

      const entry = await joinQueue(req.user!.id, req.params.queueId);
      res.status(201).json({
        data: {
          entry,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

