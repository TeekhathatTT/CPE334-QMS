import dotenv from 'dotenv';
dotenv.config();

import { Role, AccountStatus, QueueAvailability } from '@prisma/client';
import bcrypt from 'bcrypt';
import { prisma } from '../src/db';

export async function main() {
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash('Password123!', saltRounds);

  // 1. Customers
  const customer1 = await prisma.user.upsert({
    where: { id: '11111111-1111-1111-1111-111111111111' },
    update: {
      email: 'customer1@example.com',
      passwordHash,
      role: Role.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    },
    create: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'customer1@example.com',
      passwordHash,
      role: Role.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  const customer2 = await prisma.user.upsert({
    where: { id: '22222222-2222-2222-2222-222222222222' },
    update: {
      email: 'customer2@example.com',
      passwordHash,
      role: Role.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    },
    create: {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'customer2@example.com',
      passwordHash,
      role: Role.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  // 2. Operators
  const operator1 = await prisma.user.upsert({
    where: { id: '33333333-3333-3333-3333-333333333333' },
    update: {
      email: 'operator1@example.com',
      passwordHash,
      role: Role.OPERATOR,
      accountStatus: AccountStatus.ACTIVE,
    },
    create: {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'operator1@example.com',
      passwordHash,
      role: Role.OPERATOR,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  const operator2 = await prisma.user.upsert({
    where: { id: '44444444-4444-4444-4444-444444444444' },
    update: {
      email: 'operator2@example.com',
      passwordHash,
      role: Role.OPERATOR,
      accountStatus: AccountStatus.ACTIVE,
    },
    create: {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'operator2@example.com',
      passwordHash,
      role: Role.OPERATOR,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  // 3. Service Queues
  const queue1 = await prisma.serviceQueue.upsert({
    where: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
    update: {
      name: 'General Inquiry Desk',
      availability: QueueAvailability.OPEN,
      lastQueueNumber: BigInt(0),
    },
    create: {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'General Inquiry Desk',
      availability: QueueAvailability.OPEN,
      lastQueueNumber: BigInt(0),
    },
  });

  const queue2 = await prisma.serviceQueue.upsert({
    where: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
    update: {
      name: 'Specialized Consultation',
      availability: QueueAvailability.CLOSED,
      lastQueueNumber: BigInt(0),
    },
    create: {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'Specialized Consultation',
      availability: QueueAvailability.CLOSED,
      lastQueueNumber: BigInt(0),
    },
  });

  // 4. Operator Assignment: operator1 assigned to Queue 1 only (operator2 unassigned)
  const assignment1 = await prisma.operatorAssignment.upsert({
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

  console.log('Seed completed successfully:', {
    customers: [customer1.email, customer2.email],
    operators: [operator1.email, operator2.email],
    queues: [queue1.name, queue2.name],
    assignment: {
      operatorId: assignment1.operatorId,
      serviceQueueId: assignment1.serviceQueueId,
    },
  });
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
