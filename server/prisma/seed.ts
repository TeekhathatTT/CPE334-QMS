import dotenv from 'dotenv';
dotenv.config();

import { Role, AccountStatus, QueueAvailability, PrismaClient } from '@prisma/client';
import { prisma } from '../src/db';
import { hashPassword } from '../src/auth/password';

export async function seed(client: PrismaClient = prisma) {
  // Development-only password for every seeded account (documented in README).
  const passwordHash = await hashPassword('Password123!');

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

  return {
    customers: [customer1.email, customer2.email],
    operators: [operator1.email, operator2.email],
    queues: [queue1.name, queue2.name],
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
