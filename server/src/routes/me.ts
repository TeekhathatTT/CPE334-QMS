import express, { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateUuidParam } from '../middleware/validateUuid';
import { listCustomerEntries, getCustomerEntry } from '../services/queueService';

export const meRouter = express.Router();

meRouter.param('entryId', validateUuidParam('entryId'));

/**
 * GET /api/me/queue-entries
 * Lists all queue entries belonging to the authenticated customer (api-spec §7.3).
 * Allowed role: CUSTOMER only.
 */
meRouter.get(
  '/queue-entries',
  requireAuth,
  requireRole(Role.CUSTOMER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entries = await listCustomerEntries(req.user!.id);
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
 * GET /api/me/queue-entries/:entryId
 * Retrieves detail and aheadCount for a customer's own queue entry (api-spec §7.4).
 * Cross-owner lookups return 404 RESOURCE_NOT_FOUND to protect customer privacy.
 * Allowed role: CUSTOMER only.
 */
meRouter.get(
  '/queue-entries/:entryId',
  requireAuth,
  requireRole(Role.CUSTOMER),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await getCustomerEntry(req.user!.id, req.params.entryId);
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

