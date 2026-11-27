import { Prisma, QueueStatus } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors/AppError';
import { canMarkNoShow, recoveryDecision } from './noShowPolicy';
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
 * F-07 (BR-14, feature SDS D-7): `CANCELLED` entries are excluded; they stay in the database.
 */
export async function listOperatorQueueEntries(queueId: string): Promise<SerializedQueueEntry[]> {
  const entries = await prisma.queueEntry.findMany({
    where: { serviceQueueId: queueId, status: { not: QueueStatus.CANCELLED } },
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

/**
 * F-08: the assigned operator marks a `CALLED` entry `NO_SHOW` (FR-15, BR-15, BR-17;
 * Sprint 2 api-spec §9.1; feature SDS §10). Same locking pattern as Start/Complete:
 * the row lock serializes it with a concurrent Start on the same entry.
 *
 * - Missing entry: 404 RESOURCE_NOT_FOUND
 * - Operator not assigned to the entry's queue: 403 FORBIDDEN
 * - Entry status is not CALLED: 409 INVALID_STATE_TRANSITION
 */
export async function markNoShowEntry(operatorId: string, entryId: string): Promise<SerializedQueueEntry> {
  return await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ serviceQueueId: string; status: QueueStatus; now: Date }>>`
        SELECT "serviceQueueId", "status", clock_timestamp() AS "now"
        FROM "QueueEntry"
        WHERE "id" = ${entryId}::uuid
        FOR UPDATE
      `;
      if (!rows || rows.length === 0) {
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue entry not found.');
      }
      const entry = rows[0];
      await assertAssigned(tx, operatorId, entry.serviceQueueId);

      if (!canMarkNoShow(entry.status)) {
        throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only a CALLED queue entry may be marked as a no-show.');
      }

      const updated = await tx.queueEntry.update({
        where: { id: entryId },
        data: {
          status: QueueStatus.NO_SHOW,
          noShowAt: entry.now instanceof Date ? entry.now : new Date(entry.now),
          noShowCount: { increment: 1 },
        },
      });
      return formatQueueEntry(updated);
    },
    { maxWait: 15000, timeout: 15000 }
  );
}

/**
 * F-08: the assigned operator returns a `NO_SHOW` entry to the queue once (FR-16, BR-16, BR-05 rev. 3.0;
 * Sprint 2 api-spec §9.2; feature SDS §10). The entry keeps its `joinedAt` and queue number, so it is
 * back at its original FIFO position; `calledAt` is cleared and `recoveredAt` recorded.
 *
 * Locks the queue row first (the same lock `joinQueue` takes), then the entry, so a return and a join
 * by the same customer to the same queue are serialized and cannot leave two active entries.
 *
 * - Missing entry: 404 RESOURCE_NOT_FOUND
 * - Operator not assigned: 403 FORBIDDEN
 * - Status is not NO_SHOW: 409 INVALID_STATE_TRANSITION
 * - Already returned once (noShowCount 2): 409 RECOVERY_LIMIT_REACHED
 * - Customer has another active entry in the queue: 409 DUPLICATE_ACTIVE_ENTRY
 */
export async function recoverNoShowEntry(operatorId: string, entryId: string): Promise<SerializedQueueEntry> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const found = await tx.queueEntry.findUnique({ where: { id: entryId }, select: { serviceQueueId: true } });
        if (!found) {
          throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue entry not found.');
        }

        await tx.$queryRaw`
          SELECT "id" FROM "ServiceQueue" WHERE "id" = ${found.serviceQueueId}::uuid FOR UPDATE
        `;
        const rows = await tx.$queryRaw<
          Array<{ customerId: string; serviceQueueId: string; status: QueueStatus; noShowCount: number; now: Date }>
        >`
          SELECT "customerId", "serviceQueueId", "status", "noShowCount", clock_timestamp() AS "now"
          FROM "QueueEntry"
          WHERE "id" = ${entryId}::uuid
          FOR UPDATE
        `;
        const entry = rows[0];
        await assertAssigned(tx, operatorId, entry.serviceQueueId);

        const decision = recoveryDecision({ status: entry.status, noShowCount: Number(entry.noShowCount) });
        if (decision === 'invalid_state') {
          throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only a NO_SHOW queue entry may be returned to the queue.');
        }
        if (decision === 'limit') {
          throw new AppError(409, 'RECOVERY_LIMIT_REACHED', 'This queue entry was already returned to the queue once.');
        }

        const otherActive = await tx.queueEntry.findFirst({
          where: {
            customerId: entry.customerId,
            serviceQueueId: entry.serviceQueueId,
            status: { in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.SERVING] },
            id: { not: entryId },
          },
          select: { id: true },
        });
        if (otherActive) {
          throw new AppError(409, 'DUPLICATE_ACTIVE_ENTRY', 'The customer already has another active entry in this queue.');
        }

        const updated = await tx.queueEntry.update({
          where: { id: entryId },
          data: {
            status: QueueStatus.WAITING,
            calledAt: null,
            recoveredAt: entry.now instanceof Date ? entry.now : new Date(entry.now),
          },
        });
        return formatQueueEntry(updated);
      },
      { maxWait: 15000, timeout: 15000 }
    );
  } catch (error) {
    // Database backstop (partial unique index on active entries); the check above should make it unreachable.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'DUPLICATE_ACTIVE_ENTRY', 'The customer already has another active entry in this queue.');
    }
    throw error;
  }
}

async function assertAssigned(tx: Prisma.TransactionClient, operatorId: string, serviceQueueId: string): Promise<void> {
  const assignment = await tx.operatorAssignment.findUnique({
    where: { operatorId_serviceQueueId: { operatorId, serviceQueueId } },
    select: { operatorId: true },
  });
  if (!assignment) {
    throw new AppError(403, 'FORBIDDEN', 'You are not assigned to this queue.');
  }
}
