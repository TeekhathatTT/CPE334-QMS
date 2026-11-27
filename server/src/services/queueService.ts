import { Prisma, QueueAvailability } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors/AppError';
import { isCustomerCancellable } from './cancellationPolicy';

export interface QueueSummary {
  id: string;
  name: string;
  description: string | null;
  availability: QueueAvailability;
}

export interface SerializedQueueEntry {
  id: string;
  serviceQueueId: string;
  customerId: string;
  queueNumber: number;
  status: string;
  joinedAt: string;
  calledAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  /** F-07: set only when `status` is `CANCELLED`; `null` otherwise (Sprint 2 api-spec §1.1). */
  cancelledAt: string | null;
  aheadCount?: number;
}

export function formatQueueSummary(queue: {
  id: string;
  name: string;
  description: string | null;
  availability: QueueAvailability;
}): QueueSummary {
  return {
    id: queue.id,
    name: queue.name,
    description: queue.description ?? null,
    availability: queue.availability,
  };
}

export function formatQueueEntry(
  entry: {
    id: string;
    serviceQueueId: string;
    customerId: string;
    queueNumber: bigint;
    status: string;
    joinedAt: Date;
    calledAt: Date | null;
    serviceStartedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
  },
  aheadCount?: number
): SerializedQueueEntry {
  return {
    id: entry.id,
    serviceQueueId: entry.serviceQueueId,
    customerId: entry.customerId,
    queueNumber: Number(entry.queueNumber),
    status: entry.status,
    joinedAt: entry.joinedAt.toISOString(),
    calledAt: entry.calledAt ? entry.calledAt.toISOString() : null,
    serviceStartedAt: entry.serviceStartedAt ? entry.serviceStartedAt.toISOString() : null,
    completedAt: entry.completedAt ? entry.completedAt.toISOString() : null,
    cancelledAt: entry.cancelledAt ? entry.cancelledAt.toISOString() : null,
    ...(typeof aheadCount === 'number' ? { aheadCount } : {}),
  };
}

export async function listOpenQueues(): Promise<QueueSummary[]> {
  const queues = await prisma.serviceQueue.findMany({
    where: { availability: QueueAvailability.OPEN },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      availability: true,
    },
  });
  return queues.map(formatQueueSummary);
}

export async function joinQueue(customerId: string, queueId: string): Promise<SerializedQueueEntry> {
  try {
    const entry = await prisma.$transaction(
      async (tx) => {
        // Row-level lock on ServiceQueue to guarantee monotonic, non-duplicate queue numbers under concurrent load.
        // We obtain clock_timestamp() AS "now" after acquiring the FOR UPDATE lock so that
        // joinedAt reflects the exact lock acquisition order rather than transaction start time.
        const queues = await tx.$queryRaw<
          Array<{ id: string; name: string; availability: QueueAvailability; lastQueueNumber: bigint; now: Date }>
        >`
          SELECT id, name, availability, "lastQueueNumber", clock_timestamp() AS "now"
          FROM "ServiceQueue"
          WHERE id = ${queueId}::uuid
          FOR UPDATE
        `;

        if (!queues || queues.length === 0) {
          throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service queue not found.');
        }

        const queue = queues[0];
        if (queue.availability !== QueueAvailability.OPEN) {
          throw new AppError(409, 'QUEUE_NOT_AVAILABLE', 'The requested service queue is not open.');
        }

        // Check for an existing active entry (WAITING, CALLED, SERVING) in the same queue
        const existingActive = await tx.queueEntry.findFirst({
          where: {
            customerId,
            serviceQueueId: queueId,
            status: { in: ['WAITING', 'CALLED', 'SERVING'] },
          },
        });

        if (existingActive) {
          throw new AppError(409, 'DUPLICATE_ACTIVE_ENTRY', 'Customer already has an active entry in this queue.');
        }

        const nextNumber = BigInt(queue.lastQueueNumber) + 1n;

        await tx.serviceQueue.update({
          where: { id: queueId },
          data: { lastQueueNumber: nextNumber },
        });

        const joinedAt = queue.now instanceof Date ? queue.now : new Date(queue.now);

        const created = await tx.queueEntry.create({
          data: {
            customerId,
            serviceQueueId: queueId,
            queueNumber: nextNumber,
            status: 'WAITING',
            joinedAt,
          },
        });

        return created;
      },
      {
        maxWait: 15000,
        timeout: 15000,
      }
    );

    return formatQueueEntry(entry);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.target;
      const targetList = Array.isArray(target)
        ? target.map(String)
        : typeof target === 'string'
        ? [target]
        : [];
      const errorMsg = error.message || '';

      const isQueueNumberDuplicate =
        targetList.includes('QueueEntry_serviceQueueId_queueNumber_key') ||
        (targetList.includes('serviceQueueId') && targetList.includes('queueNumber')) ||
        errorMsg.includes('QueueEntry_serviceQueueId_queueNumber_key');

      if (isQueueNumberDuplicate) {
        // Do NOT mask queue-number allocation bug/conflict as duplicate customer entry!
        throw error;
      }

      const isActiveEntryDuplicate =
        targetList.includes('QueueEntry_active_customer_queue_uidx') ||
        (targetList.includes('customerId') && targetList.includes('serviceQueueId')) ||
        errorMsg.includes('QueueEntry_active_customer_queue_uidx');

      if (isActiveEntryDuplicate) {
        throw new AppError(409, 'DUPLICATE_ACTIVE_ENTRY', 'Customer already has an active entry in this queue.');
      }

      // Any other unexpected unique constraint violation bubbles up as 500 INTERNAL_ERROR
      throw error;
    }
    throw error;
  }
}

export async function listCustomerEntries(customerId: string): Promise<SerializedQueueEntry[]> {
  const entries = await prisma.queueEntry.findMany({
    where: { customerId },
    orderBy: [
      { joinedAt: 'desc' },
      { id: 'desc' },
    ],
  });

  return entries.map((entry) => formatQueueEntry(entry));
}

export async function computeAheadCount(
  entry: { id: string; serviceQueueId: string; joinedAt: Date; status: string },
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  if (entry.status !== 'WAITING') {
    return 0;
  }

  return await client.queueEntry.count({
    where: {
      serviceQueueId: entry.serviceQueueId,
      status: 'WAITING',
      OR: [
        { joinedAt: { lt: entry.joinedAt } },
        { joinedAt: entry.joinedAt, id: { lt: entry.id } },
      ],
    },
  });
}

export async function getCustomerEntry(customerId: string, entryId: string): Promise<SerializedQueueEntry> {
  const entry = await prisma.queueEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry || entry.customerId !== customerId) {
    // Cross-owner customer lookup is masked as 404 RESOURCE_NOT_FOUND per SDS §5.3 / api-spec §7.4
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue entry not found.');
  }

  const aheadCount = await computeAheadCount(entry);
  return formatQueueEntry(entry, aheadCount);
}

/**
 * F-07: the owning customer cancels their own `WAITING` entry (FR-14, BR-13, BR-14;
 * Sprint 2 api-spec §3.1; feature SDS §10).
 *
 * One transaction:
 * 1. read the entry; missing or another customer's entry -> 404 RESOURCE_NOT_FOUND (privacy, BR-07)
 * 2. not `WAITING` -> 409 INVALID_STATE_TRANSITION (a repeated cancel included)
 * 3. conditional UPDATE ... WHERE status = 'WAITING' with `cancelledAt = clock_timestamp()`;
 *    no row updated means another request (e.g. Call Next) changed it first -> 409 CONCURRENT_MODIFICATION
 *
 * Under READ COMMITTED the UPDATE waits for a row lock held by an in-flight Call Next and re-checks
 * the predicate on the committed row, so cancel and Call Next can never both succeed on one entry.
 * Queue availability is deliberately not checked: a CLOSED queue's entries can be cancelled.
 * Success is returned only after the transaction commits (NFR-05).
 */
export async function cancelEntry(customerId: string, entryId: string): Promise<SerializedQueueEntry> {
  const cancelled = await prisma.$transaction(
    async (tx) => {
      const entry = await tx.queueEntry.findUnique({
        where: { id: entryId },
        select: { customerId: true, status: true },
      });

      if (!entry || entry.customerId !== customerId) {
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue entry not found.');
      }

      if (!isCustomerCancellable(entry.status)) {
        throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only a WAITING queue entry may be cancelled.');
      }

      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "QueueEntry"
        SET "status" = 'CANCELLED'::"QueueStatus", "cancelledAt" = clock_timestamp()
        WHERE "id" = ${entryId}::uuid
          AND "customerId" = ${customerId}::uuid
          AND "status" = 'WAITING'::"QueueStatus"
        RETURNING "id"
      `;

      if (updated.length === 0) {
        throw new AppError(409, 'CONCURRENT_MODIFICATION', 'The queue entry was changed by another request.');
      }

      return tx.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
    },
    {
      maxWait: 15000,
      timeout: 15000,
    }
  );

  // A CANCELLED entry has no position in the line (api-spec §3.3 / Sprint 2 api-spec §1.1).
  return formatQueueEntry(cancelled, 0);
}

