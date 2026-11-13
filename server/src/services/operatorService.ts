import { QueueStatus } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors/AppError';
import {
  formatQueueEntry,
  formatQueueSummary,
  type QueueSummary,
  type SerializedQueueEntry,
} from './queueService';

/**
 * Lists all service queues assigned to the given operator (api-spec §8.1).
 * Ordered deterministically by queue creation timestamp and id.
 */
export async function listAssignedQueues(operatorId: string): Promise<QueueSummary[]> {
  const assignments = await prisma.operatorAssignment.findMany({
    where: { operatorId },
    orderBy: [
      { serviceQueue: { createdAt: 'asc' } },
      { serviceQueueId: 'asc' },
    ],
    select: {
      serviceQueue: {
        select: {
          id: true,
          name: true,
          description: true,
          availability: true,
        },
      },
    },
  });

  return assignments.map((assignment) => formatQueueSummary(assignment.serviceQueue));
}

/**
 * Lists all queue entries for an assigned queue in deterministic FIFO order:
 * `joinedAt ASC, id ASC` (api-spec §8.2, QUEUE-007).
 */
export async function listOperatorQueueEntries(queueId: string): Promise<SerializedQueueEntry[]> {
  const entries = await prisma.queueEntry.findMany({
    where: { serviceQueueId: queueId },
    orderBy: [
      { joinedAt: 'asc' },
      { id: 'asc' },
    ],
  });

  return entries.map((entry) => formatQueueEntry(entry));
}

/**
 * Selects the oldest eligible WAITING entry in FIFO order (`joinedAt ASC, id ASC`)
 * and transitions it to `CALLED` atomically inside a row-locked transaction
 * (`FOR UPDATE SKIP LOCKED`) so concurrent call-next requests never claim the same entry
 * (api-spec §8.3, FLOW-001, FLOW-002, FLOW-003, CONCURRENCY-003).
 *
 * Returns `null` when no eligible WAITING entry exists (caller responds with 204 No Content).
 */
export async function callNextEntry(queueId: string): Promise<SerializedQueueEntry | null> {
  return await prisma.$transaction(
    async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: string; now: Date }>>`
        SELECT "id", clock_timestamp() AS "now"
        FROM "QueueEntry"
        WHERE "serviceQueueId" = ${queueId}::uuid
          AND "status" = 'WAITING'::"QueueStatus"
        ORDER BY "joinedAt" ASC, "id" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (!candidates || candidates.length === 0) {
        return null;
      }

      const candidate = candidates[0];
      const calledAt = candidate.now instanceof Date ? candidate.now : new Date(candidate.now);

      const updated = await tx.queueEntry.update({
        where: { id: candidate.id },
        data: {
          status: QueueStatus.CALLED,
          calledAt,
        },
      });

      return formatQueueEntry(updated);
    },
    {
      maxWait: 15000,
      timeout: 15000,
    }
  );
}

/**
 * Transitions a `CALLED` entry to `SERVING` and sets `serviceStartedAt` atomically
 * (api-spec §8.4, FLOW-004, FLOW-005, RBAC-002, RBAC-004, CONCURRENCY-004).
 *
 * - Missing entry: 404 RESOURCE_NOT_FOUND
 * - Operator not assigned to the entry's queue: 403 FORBIDDEN
 * - Entry status is not CALLED: 409 INVALID_STATE_TRANSITION
 */
export async function startServiceEntry(
  operatorId: string,
  entryId: string
): Promise<SerializedQueueEntry> {
  return await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; serviceQueueId: string; status: QueueStatus; now: Date }>
      >`
        SELECT "id", "serviceQueueId", "status", clock_timestamp() AS "now"
        FROM "QueueEntry"
        WHERE "id" = ${entryId}::uuid
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue entry not found.');
      }

      const entry = rows[0];

      const assignment = await tx.operatorAssignment.findUnique({
        where: {
          operatorId_serviceQueueId: {
            operatorId,
            serviceQueueId: entry.serviceQueueId,
          },
        },
        select: { operatorId: true },
      });

      if (!assignment) {
        throw new AppError(403, 'FORBIDDEN', 'You are not assigned to this queue.');
      }

      if (entry.status !== QueueStatus.CALLED) {
        throw new AppError(
          409,
          'INVALID_STATE_TRANSITION',
          'Only a CALLED queue entry may transition to SERVING.'
        );
      }

      const serviceStartedAt = entry.now instanceof Date ? entry.now : new Date(entry.now);

      const updated = await tx.queueEntry.update({
        where: { id: entryId },
        data: {
          status: QueueStatus.SERVING,
          serviceStartedAt,
        },
      });

      return formatQueueEntry(updated);
    },
    {
      maxWait: 15000,
      timeout: 15000,
    }
  );
}

/**
 * Transitions a `SERVING` entry to `COMPLETED` and sets `completedAt` atomically
 * (api-spec §8.5, FLOW-005, FLOW-006, FLOW-007, RBAC-003, RBAC-004, CONCURRENCY-004).
 *
 * - Missing entry: 404 RESOURCE_NOT_FOUND
 * - Operator not assigned to the entry's queue: 403 FORBIDDEN
 * - Entry status is not SERVING: 409 INVALID_STATE_TRANSITION
 */
export async function completeServiceEntry(
  operatorId: string,
  entryId: string
): Promise<SerializedQueueEntry> {
  return await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; serviceQueueId: string; status: QueueStatus; now: Date }>
      >`
        SELECT "id", "serviceQueueId", "status", clock_timestamp() AS "now"
        FROM "QueueEntry"
        WHERE "id" = ${entryId}::uuid
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue entry not found.');
      }

      const entry = rows[0];

      const assignment = await tx.operatorAssignment.findUnique({
        where: {
          operatorId_serviceQueueId: {
            operatorId,
            serviceQueueId: entry.serviceQueueId,
          },
        },
        select: { operatorId: true },
      });

      if (!assignment) {
        throw new AppError(403, 'FORBIDDEN', 'You are not assigned to this queue.');
      }

      if (entry.status !== QueueStatus.SERVING) {
        throw new AppError(
          409,
          'INVALID_STATE_TRANSITION',
          'Only a SERVING queue entry may transition to COMPLETED.'
        );
      }

      const completedAt = entry.now instanceof Date ? entry.now : new Date(entry.now);

      const updated = await tx.queueEntry.update({
        where: { id: entryId },
        data: {
          status: QueueStatus.COMPLETED,
          completedAt,
        },
      });

      return formatQueueEntry(updated);
    },
    {
      maxWait: 15000,
      timeout: 15000,
    }
  );
}

