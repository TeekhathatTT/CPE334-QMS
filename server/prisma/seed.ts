import dotenv from 'dotenv';
dotenv.config();

import { Role, AccountStatus, QueueAvailability, CounterStatus, PrismaClient } from '@prisma/client';
import { prisma } from '../src/db';
import { hashPassword } from '../src/auth/password';

/** Fixed password for local development and automated tests only (documented in README). */
export const DEV_SEED_PASSWORD = 'Password123!';
export const MIN_SEED_PASSWORD_LENGTH = 12;

/**
 * Chooses the password for every seeded account.
 *
 * - SEED_PASSWORD, when set, is used as-is (at least 12 characters, never the public dev password).
 * - Without it, the fixed dev password is allowed only when NODE_ENV is development or test.
 *   Any other environment (production, unset, a cloud database reached through a proxy) must
 *   set SEED_PASSWORD privately, because the dev password is published in this public repository.
 */
export function resolveSeedPassword(env: NodeJS.ProcessEnv = process.env): string {
  const provided = env.SEED_PASSWORD;
  if (provided !== undefined && provided !== '') {
    if (provided === DEV_SEED_PASSWORD) {
      throw new Error('SEED_PASSWORD must not be the public development password.');
    }
    if (provided.length < MIN_SEED_PASSWORD_LENGTH) {
      throw new Error(`SEED_PASSWORD must be at least ${MIN_SEED_PASSWORD_LENGTH} characters.`);
    }
    return provided;
  }
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return DEV_SEED_PASSWORD;
  }
  throw new Error(
    'SEED_PASSWORD is required unless NODE_ENV is development or test. Set it in the shell, never in a committed file.'
  );
}

export async function seed(client: PrismaClient = prisma, password: string = resolveSeedPassword()) {
  const passwordHash = await hashPassword(password);

  // 1. Customers (RFC 4122 UUIDv4)
  const customer1 = await client.user.upsert({
    where: { id: '11111111-1111-4111-8111-111111111111' },
    update: {
      email: 'customer1@example.com',
      passwordHash,
      role: Role.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    },
    create: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'customer1@example.com',
      passwordHash,
      role: Role.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  const customer2 = await client.user.upsert({
    where: { id: '22222222-2222-4222-8222-222222222222' },
    update: {
      email: 'customer2@example.com',
      passwordHash,
      role: Role.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    },
    create: {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'customer2@example.com',
      passwordHash,
      role: Role.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  // 2. Operators (RFC 4122 UUIDv4)
  const operator1 = await client.user.upsert({
    where: { id: '33333333-3333-4333-8333-333333333333' },
    update: {
      email: 'operator1@example.com',
      passwordHash,
      role: Role.OPERATOR,
      accountStatus: AccountStatus.ACTIVE,
    },
    create: {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'operator1@example.com',
      passwordHash,
      role: Role.OPERATOR,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  const operator2 = await client.user.upsert({
    where: { id: '44444444-4444-4444-8444-444444444444' },
    update: {
      email: 'operator2@example.com',
      passwordHash,
      role: Role.OPERATOR,
      accountStatus: AccountStatus.ACTIVE,
    },
    create: {
      id: '44444444-4444-4444-8444-444444444444',
      email: 'operator2@example.com',
      passwordHash,
      role: Role.OPERATOR,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  // 3. Service Queues (RFC 4122 UUIDv4)
  // Notice: lastQueueNumber is intentionally omitted from update to preserve non-decreasing invariant (SDS §3.2)
  const queue1 = await client.serviceQueue.upsert({
    where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    update: {
      name: 'General Inquiry Desk',
      availability: QueueAvailability.OPEN,
    },
    create: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'General Inquiry Desk',
      availability: QueueAvailability.OPEN,
      lastQueueNumber: BigInt(0),
    },
  });

  const queue2 = await client.serviceQueue.upsert({
    where: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    update: {
      name: 'Specialized Consultation',
      availability: QueueAvailability.CLOSED,
    },
    create: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Specialized Consultation',
      availability: QueueAvailability.CLOSED,
      lastQueueNumber: BigInt(0),
    },
  });

  // 4. Operator Assignment: operator1 assigned to Queue 1 only (operator2 unassigned)
  const assignment1 = await client.operatorAssignment.upsert({
    where: {
      operatorId_serviceQueueId: {
        operatorId: operator1.id,
        serviceQueueId: queue1.id,
      },
    },
    update: {},
    create: {
      operatorId: operator1.id,
      serviceQueueId: queue1.id,
    },
  });

  // 5. Default Counters (F-09, local dev/test only — production uses prisma/provision-counters.ts).
  // Notice: `status` is intentionally omitted from `update` so re-seeding preserves operational counter state.
  const counterDefs = [
    { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', serviceQueueId: queue1.id, name: 'Counter 1' },
    { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', serviceQueueId: queue1.id, name: 'Counter 2' },
    { id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', serviceQueueId: queue2.id, name: 'Counter 1' },
    { id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', serviceQueueId: queue2.id, name: 'Counter 2' },
  ];

  const counters = [];
  for (const def of counterDefs) {
    const counter = await client.counter.upsert({
      where: { id: def.id },
      update: {
        serviceQueueId: def.serviceQueueId,
        name: def.name,
      },
      create: {
        id: def.id,
        serviceQueueId: def.serviceQueueId,
        name: def.name,
        status: CounterStatus.OPEN,
        assignedOperatorId: null,
      },
    });
    counters.push(counter.name);
  }

  return {
    customers: [customer1.email, customer2.email],
    operators: [operator1.email, operator2.email],
    queues: [queue1.name, queue2.name],
    counters,
    assignment: {
      operatorId: assignment1.operatorId,
      serviceQueueId: assignment1.serviceQueueId,
    },
  };
}

export async function main() {
  const result = await seed();
  console.log('Seed completed successfully:', result);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
