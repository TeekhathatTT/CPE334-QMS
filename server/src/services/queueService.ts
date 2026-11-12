import { Prisma, QueueAvailability } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../errors/AppError';

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
    const entry = await prisma.$transaction(async (tx) => {
      // Row-level lock on ServiceQueue to guarantee monotonic, non-duplicate queue numbers under concurrent load
      const queues = await tx.$queryRaw<
        Array<{ id: string; name: string; availability: QueueAvailability; lastQueueNumber: bigint }>
      >`
        SELECT id, name, availability, "lastQueueNumber"
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

      const created = await tx.queueEntry.create({
        data: {
          customerId,
          serviceQueueId: queueId,
          queueNumber: nextNumber,
          status: 'WAITING',
        },
      });

      return created;
    });

    return formatQueueEntry(entry);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'DUPLICATE_ACTIVE_ENTRY', 'Customer already has an active entry in this queue.');
    }
    throw error;
  }
}

export async function listCustomerEntries(customerId: string): Promise<SerializedQueueEntry[]> {
  const entries = await prisma.queueEntry.findMany({
    where: { customerId },
    orderBy: { joinedAt: 'desc' },
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

