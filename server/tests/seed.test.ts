import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../src/db';
import bcrypt from 'bcrypt';
import { main } from '../prisma/seed';
import { Role, AccountStatus, QueueAvailability } from '@prisma/client';

describe('Idempotent Seed Script', () => {
  it('calls upsert for customers, operators, queues, and operator assignments', async () => {
    const userUpsertSpy = vi.spyOn(prisma.user, 'upsert').mockImplementation((args: any) => {
      return Promise.resolve({
        id: args.where.id!,
        email: args.create.email,
        passwordHash: args.create.passwordHash,
        role: args.create.role,
        accountStatus: args.create.accountStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as any;
    });

    const queueUpsertSpy = vi.spyOn(prisma.serviceQueue, 'upsert').mockImplementation((args: any) => {
      return Promise.resolve({
        id: args.where.id!,
        name: args.create.name,
        description: args.create.description ?? null,
        availability: args.create.availability ?? QueueAvailability.OPEN,
        lastQueueNumber: args.create.lastQueueNumber ?? BigInt(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as any;
    });

    const assignmentUpsertSpy = vi.spyOn(prisma.operatorAssignment, 'upsert').mockImplementation((args: any) => {
      return Promise.resolve({
        operatorId: args.create.operatorId,
        serviceQueueId: args.create.serviceQueueId,
        assignedAt: new Date(),
      }) as any;
    });

    const hashSpy = vi.spyOn(bcrypt, 'hash');

    await main();

    // 1. Password hashing
    expect(hashSpy).toHaveBeenCalledWith('Password123!', 10);

    // 2. 4 Users (2 Customers, 2 Operators)
    expect(userUpsertSpy).toHaveBeenCalledTimes(4);

    // Customer 1
    expect(userUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '11111111-1111-1111-1111-111111111111' },
        create: expect.objectContaining({
          email: 'customer1@example.com',
          role: Role.CUSTOMER,
          accountStatus: AccountStatus.ACTIVE,
        }),
      })
    );

    // Customer 2
    expect(userUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '22222222-2222-2222-2222-222222222222' },
        create: expect.objectContaining({
          email: 'customer2@example.com',
          role: Role.CUSTOMER,
          accountStatus: AccountStatus.ACTIVE,
        }),
      })
    );

    // Operator 1
    expect(userUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '33333333-3333-3333-3333-333333333333' },
        create: expect.objectContaining({
          email: 'operator1@example.com',
          role: Role.OPERATOR,
          accountStatus: AccountStatus.ACTIVE,
        }),
      })
    );

    // Operator 2
    expect(userUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '44444444-4444-4444-4444-444444444444' },
        create: expect.objectContaining({
          email: 'operator2@example.com',
          role: Role.OPERATOR,
          accountStatus: AccountStatus.ACTIVE,
        }),
      })
    );

    // 3. 2 Service Queues
    expect(queueUpsertSpy).toHaveBeenCalledTimes(2);

    // Queue 1: General Inquiry Desk (OPEN)
    expect(queueUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        create: expect.objectContaining({
          name: 'General Inquiry Desk',
          availability: QueueAvailability.OPEN,
          lastQueueNumber: BigInt(0),
        }),
      })
    );

    // Queue 2: Specialized Consultation (CLOSED)
    expect(queueUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
        create: expect.objectContaining({
          name: 'Specialized Consultation',
          availability: QueueAvailability.CLOSED,
          lastQueueNumber: BigInt(0),
        }),
      })
    );

    // 4. Operator Assignment: operator1 assigned to Queue 1 only
    expect(assignmentUpsertSpy).toHaveBeenCalledTimes(1);
    expect(assignmentUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          operatorId_serviceQueueId: {
            operatorId: '33333333-3333-3333-3333-333333333333',
            serviceQueueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          },
        },
        create: {
          operatorId: '33333333-3333-3333-3333-333333333333',
          serviceQueueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        },
      })
    );
  });
});
