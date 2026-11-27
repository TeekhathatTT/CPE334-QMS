import express, { Request, Response, NextFunction } from 'express';
import { CounterStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
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
  markNoShowEntry,
  recoverNoShowEntry,
  listQueueCounters,
  updateCounterStatus,
  callNextAtCounter,
} from '../services/operatorService';

export const operatorRouter = express.Router();

operatorRouter.param('queueId', validateUuidParam('queueId'));
operatorRouter.param('entryId', validateUuidParam('entryId'));
operatorRouter.param('counterId', validateUuidParam('counterId'));

const updateCounterStatusBodySchema = z
  .object({
    status: z.enum([CounterStatus.OPEN, CounterStatus.CLOSED]),
  })
  .strict();

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

/**
 * POST /api/operator/queue-entries/:entryId/no-show
 * F-08: marks a CALLED entry NO_SHOW (Sprint 2 api-spec §9.1).
 * Allowed role: assigned OPERATOR only. Requires CSRF protection.
 */
operatorRouter.post(
  '/queue-entries/:entryId/no-show',
  requireAuth,
  requireCsrf,
  requireRole(Role.OPERATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await markNoShowEntry(req.user!.id, req.params.entryId);
      res.status(200).json({ data: { entry } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/operator/queue-entries/:entryId/recover
 * F-08: returns a NO_SHOW entry to the queue once, at its original FIFO position (Sprint 2 api-spec §9.2).
 * Allowed role: assigned OPERATOR only. Requires CSRF protection.
 */
operatorRouter.post(
  '/queue-entries/:entryId/recover',
  requireAuth,
  requireCsrf,
  requireRole(Role.OPERATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await recoverNoShowEntry(req.user!.id, req.params.entryId);
      res.status(200).json({ data: { entry } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/operator/queues/:queueId/counters
 * F-09: lists counters for an assigned queue in deterministic order (Sprint 2 api-spec §14.1).
 * Allowed role: assigned OPERATOR only.
 */
operatorRouter.get(
  '/queues/:queueId/counters',
  requireAuth,
  requireRole(Role.OPERATOR),
  requireQueueAssignment,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const counters = await listQueueCounters(req.params.queueId);
      res.status(200).json({ data: { counters } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/operator/counters/:counterId/status
 * F-09: opens or closes a counter (Sprint 2 api-spec §14.2).
 * Allowed role: assigned OPERATOR (matching assignedOperatorId if set). Requires CSRF.
 */
operatorRouter.patch(
  '/counters/:counterId/status',
  requireAuth,
  requireCsrf,
  requireRole(Role.OPERATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateCounterStatusBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new AppError(400, 'INVALID_ARGUMENT', 'Counter status must be OPEN or CLOSED.'));
      }
      const counter = await updateCounterStatus(req.params.counterId, req.user!.id, parsed.data.status);
      res.status(200).json({ data: { counter } });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/operator/counters/:counterId/call-next
 * F-09: calls the oldest eligible WAITING entry for an OPEN counter (Sprint 2 api-spec §14.3).
 * Allowed role: assigned OPERATOR (matching assignedOperatorId if set). Requires CSRF.
 */
operatorRouter.post(
  '/counters/:counterId/call-next',
  requireAuth,
  requireCsrf,
  requireRole(Role.OPERATOR),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await callNextAtCounter(req.params.counterId, req.user!.id);
      res.status(200).json({ data: { entry } });
    } catch (error) {
      next(error);
    }
  }
);
