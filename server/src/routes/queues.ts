import express, { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
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

