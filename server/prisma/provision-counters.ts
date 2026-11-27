/**
 * Dedicated, idempotent counter-only provisioning script for production / Cloud SQL (F-09, Issue #42).
 *
 * Unlike `server/prisma/seed.ts` (which is for local dev/test only and upserts demo users, passwords,
 * queues, and assignments), this script ONLY inserts missing default counters (`Counter 1`, `Counter 2`)
 * for existing `ServiceQueue` rows and never modifies users, passwords, queues, assignments, or existing
 * counter statuses.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npm run provision:counters --workspace=server
 */
import dotenv from 'dotenv';
dotenv.config();

import { CounterStatus, PrismaClient } from '@prisma/client';
import { prisma } from '../src/db';

const DEFAULT_COUNTER_NAMES = ['Counter 1', 'Counter 2'] as const;

export async function provisionCounters(client: PrismaClient = prisma): Promise<{
  queuesScanned: number;
  countersCreated: number;
}> {
  const queues = await client.serviceQueue.findMany({
    select: { id: true, name: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  if (queues.length === 0) {
    return { queuesScanned: 0, countersCreated: 0 };
  }

  const rows = queues.flatMap((queue) =>
    DEFAULT_COUNTER_NAMES.map((name) => ({
      serviceQueueId: queue.id,
      name,
      status: CounterStatus.OPEN,
      assignedOperatorId: null,
    }))
  );

  // `skipDuplicates: true` relies on `Counter_serviceQueueId_name_key` (`UNIQUE (serviceQueueId, name)`),
  // leaving any existing counters (and their operational OPEN/CLOSED status) untouched.
  const result = await client.counter.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return {
    queuesScanned: queues.length,
    countersCreated: result.count,
  };
}

async function main() {
  const summary = await provisionCounters();
  console.log('Counter-only provisioning completed:', summary);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
