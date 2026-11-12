import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db';
import { seed } from '../prisma/seed';
import bcrypt from 'bcrypt';
import { Role, AccountStatus, QueueAvailability } from '@prisma/client';

describe('Database Integration: Idempotent Seed Script', () => {
  beforeAll(async () => {
    // Fail loudly if database is unreachable
    await prisma.$queryRaw`SELECT 1`;

    // Clean up test database before test
    await prisma.queueEntry.deleteMany({});
    await prisma.operatorAssignment.deleteMany({});
    await prisma.serviceQueue.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('provisions deterministic RFC 4122 UUIDv4 users, queues, and assignments on first run', async () => {
    const result = await seed(prisma);

    expect(result.customers).toEqual(['customer1@example.com', 'customer2@example.com']);
    expect(result.operators).toEqual(['operator1@example.com', 'operator2@example.com']);
    expect(result.queues).toEqual(['General Inquiry Desk', 'Specialized Consultation']);

    // Verify Customers
    const customer1 = await prisma.user.findUnique({
      where: { id: '11111111-1111-4111-8111-111111111111' },
    });
    expect(customer1).not.toBeNull();
    expect(customer1?.email).toBe('customer1@example.com');
    expect(customer1?.role).toBe(Role.CUSTOMER);
    expect(customer1?.accountStatus).toBe(AccountStatus.ACTIVE);
    expect(await bcrypt.compare('Password123!', customer1!.passwordHash)).toBe(true);

    const customer2 = await prisma.user.findUnique({
      where: { id: '22222222-2222-4222-8222-222222222222' },
    });
    expect(customer2).not.toBeNull();
    expect(customer2?.email).toBe('customer2@example.com');

    // Verify Operators
    const operator1 = await prisma.user.findUnique({
      where: { id: '33333333-3333-4333-8333-333333333333' },
    });
    expect(operator1).not.toBeNull();
    expect(operator1?.role).toBe(Role.OPERATOR);

    const operator2 = await prisma.user.findUnique({
      where: { id: '44444444-4444-4444-8444-444444444444' },
    });
    expect(operator2).not.toBeNull();
    expect(operator2?.role).toBe(Role.OPERATOR);

    // Verify Queues
    const queue1 = await prisma.serviceQueue.findUnique({
      where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    expect(queue1).not.toBeNull();
    expect(queue1?.name).toBe('General Inquiry Desk');
    expect(queue1?.availability).toBe(QueueAvailability.OPEN);
    expect(queue1?.lastQueueNumber).toBe(BigInt(0));

    const queue2 = await prisma.serviceQueue.findUnique({
      where: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    });
    expect(queue2).not.toBeNull();
    expect(queue2?.name).toBe('Specialized Consultation');
    expect(queue2?.availability).toBe(QueueAvailability.CLOSED);
    expect(queue2?.lastQueueNumber).toBe(BigInt(0));

    // Verify Operator Assignment
    const assignments = await prisma.operatorAssignment.findMany({});
    expect(assignments).toHaveLength(1);
    expect(assignments[0].operatorId).toBe('33333333-3333-4333-8333-333333333333');
    expect(assignments[0].serviceQueueId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('CRITICAL: re-running seed does NOT reset lastQueueNumber back to 0 and creates no duplicate rows', async () => {
    // 1. Simulate active queue mutation (increment counter to 5)
    await prisma.serviceQueue.update({
      where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      data: { lastQueueNumber: BigInt(5) },
    });

    // Verify counter is now 5
    const queueBefore = await prisma.serviceQueue.findUnique({
      where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    expect(queueBefore?.lastQueueNumber).toBe(BigInt(5));

    // 2. Re-run seed
    await seed(prisma);

    // 3. Assert counter remains 5 (strictly preserving SDS §3.2 non-decreasing counter invariant)
    const queueAfter = await prisma.serviceQueue.findUnique({
      where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    expect(queueAfter?.lastQueueNumber).toBe(BigInt(5));

    // 4. Assert total row counts are unchanged (no duplicates)
    const userCount = await prisma.user.count();
    const queueCount = await prisma.serviceQueue.count();
    const assignmentCount = await prisma.operatorAssignment.count();

    expect(userCount).toBe(4);
    expect(queueCount).toBe(2);
    expect(assignmentCount).toBe(1);
  });
});
