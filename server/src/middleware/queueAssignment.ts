import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors/AppError';
import { isValidUuidV4 } from './validateUuid';

/**
 * Operator queue-assignment guard for routes with a `:queueId` parameter (api-spec §8.2):
 * - assigned OPERATOR: passes
 * - queue does not exist: 404 RESOURCE_NOT_FOUND
 * - OPERATOR not assigned to the queue: 403 FORBIDDEN
 *
 * Mount after `requireAuth` and `requireRole(Role.OPERATOR)`.
 */
export async function requireQueueAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'));
    }
    if (req.user.role !== Role.OPERATOR) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'));
    }

    const queueId = req.params.queueId;
    if (typeof queueId !== 'string' || !isValidUuidV4(queueId)) {
      return next(new AppError(400, 'INVALID_ARGUMENT', 'Malformed queueId parameter. Must be a valid UUIDv4.'));
    }

    const queue = await prisma.serviceQueue.findUnique({ where: { id: queueId }, select: { id: true } });
    if (!queue) {
      return next(new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue not found.'));
    }

    const assignment = await prisma.operatorAssignment.findUnique({
      where: { operatorId_serviceQueueId: { operatorId: req.user.id, serviceQueueId: queueId } },
      select: { operatorId: true },
    });
    if (!assignment) {
      return next(new AppError(403, 'FORBIDDEN', 'You are not assigned to this queue.'));
    }

    next();
  } catch (err) {
    next(err);
  }
}
