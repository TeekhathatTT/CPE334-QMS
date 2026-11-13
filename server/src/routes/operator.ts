import express, { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireCsrf } from '../middleware/csrf';
import { requireQueueAssignment } from '../middleware/queueAssignment';
import { validateUuidParam } from '../middleware/validateUuid';
import {
  listAssignedQueues,
  listOperatorQueueEntries,
  callNextEntry,
  startServiceEntry,
  completeServiceEntry,
} from '../services/operatorService';

export const operatorRouter = express.Router();

operatorRouter.param('queueId', validateUuidParam('queueId'));
operatorRouter.param('entryId', validateUuidParam('entryId'));

/**
 * GET /api/operator/queues
 * Lists all service queues assigned to the authenticated operator (api-spec §8.1).
 * Allowed role: OPERATOR only.
 */
operatorRouter.get(
  '/queues',
  requireAuth,
  requireRole(Role.OPERATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queues = await listAssignedQueues(req.user!.id);
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
 * GET /api/operator/queues/:queueId/entries
 * Lists all entries for an assigned queue in deterministic FIFO order (api-spec §8.2, QUEUE-007).
 * Allowed role: assigned OPERATOR only.
 */
operatorRouter.get(
  '/queues/:queueId/entries',
  requireAuth,
  requireRole(Role.OPERATOR),
  requireQueueAssignment,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entries = await listOperatorQueueEntries(req.params.queueId);
      res.status(200).json({
        data: {
          entries,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/operator/queues/:queueId/call-next
 * Selects the oldest eligible WAITING entry in FIFO order and transitions it to CALLED (api-spec §8.3).
 * Returns 204 No Content with no body when no eligible WAITING entry exists.
 * Allowed role: assigned OPERATOR only. Requires CSRF protection.
 */
operatorRouter.post(
  '/queues/:queueId/call-next',
  requireAuth,
  requireCsrf,
  requireRole(Role.OPERATOR),
  requireQueueAssignment,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await callNextEntry(req.params.queueId);
      if (!entry) {
        res.status(204).end();
        return;
      }
      res.status(200).json({
        data: {
          entry,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/operator/queue-entries/:entryId/start
 * Transitions a CALLED entry to SERVING (api-spec §8.4).
 * Allowed role: assigned OPERATOR only. Requires CSRF protection.
 */
operatorRouter.post(
  '/queue-entries/:entryId/start',
  requireAuth,
  requireCsrf,
  requireRole(Role.OPERATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await startServiceEntry(req.user!.id, req.params.entryId);
      res.status(200).json({
        data: {
          entry,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/operator/queue-entries/:entryId/complete
 * Transitions a SERVING entry to COMPLETED (api-spec §8.5).
 * Allowed role: assigned OPERATOR only. Requires CSRF protection.
 */
operatorRouter.post(
  '/queue-entries/:entryId/complete',
  requireAuth,
  requireCsrf,
  requireRole(Role.OPERATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await completeServiceEntry(req.user!.id, req.params.entryId);
      res.status(200).json({
        data: {
          entry,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

