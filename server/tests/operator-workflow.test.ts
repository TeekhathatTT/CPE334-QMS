import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { QueueStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/db';
import {
  resetAndSeed,
  login,
  CUSTOMER1,
  CUSTOMER2,
  OPERATOR1,
  OPERATOR2,
  OPEN_QUEUE_ID,
  CLOSED_QUEUE_ID,
  type LoggedIn,
} from './helpers/auth';

describe('Issue #6: Operator Queue Management Workflow', () => {
  let customer1: LoggedIn;
  let customer2: LoggedIn;
  let operator1: LoggedIn;
  let operator2: LoggedIn;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    await resetAndSeed();
    customer1 = await login(app, CUSTOMER1.email);
    customer2 = await login(app, CUSTOMER2.email);
    operator1 = await login(app, OPERATOR1.email);
    operator2 = await login(app, OPERATOR2.email);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Operator Assigned Queues (GET /api/operator/queues)', () => {
    it('returns only service queues assigned to the authenticated operator', async () => {
      // operator1 is assigned to OPEN_QUEUE_ID ("General Inquiry Desk") in seed
      const res1 = await request(app)
        .get('/api/operator/queues')
        .set('Cookie', operator1.cookieHeader);

      expect(res1.status).toBe(200);
      expect(res1.body.data.queues).toHaveLength(1);
      expect(res1.body.data.queues[0]).toEqual({
        id: OPEN_QUEUE_ID,
        name: 'General Inquiry Desk',
        description: null,
        availability: 'OPEN',
      });

      // operator2 has no assigned queues in seed -> empty array
      const res2 = await request(app)
        .get('/api/operator/queues')
        .set('Cookie', operator2.cookieHeader);

      expect(res2.status).toBe(200);
      expect(res2.body.data.queues).toEqual([]);
    });

    it('includes CLOSED queues if assigned to the operator', async () => {
      await prisma.operatorAssignment.create({
        data: {
          operatorId: OPERATOR2.id,
          serviceQueueId: CLOSED_QUEUE_ID,
        },
      });

      const res = await request(app)
        .get('/api/operator/queues')
        .set('Cookie', operator2.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.queues).toHaveLength(1);
      expect(res.body.data.queues[0].id).toBe(CLOSED_QUEUE_ID);
      expect(res.body.data.queues[0].availability).toBe('CLOSED');
    });

    it('rejects CUSTOMER role with 403 FORBIDDEN and anonymous with 401 UNAUTHORIZED', async () => {
      const custRes = await request(app)
        .get('/api/operator/queues')
        .set('Cookie', customer1.cookieHeader);
      expect(custRes.status).toBe(403);
      expect(custRes.body.error.code).toBe('FORBIDDEN');

      const anonRes = await request(app).get('/api/operator/queues');
      expect(anonRes.status).toBe(401);
      expect(anonRes.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. FIFO Operator Queue Entries Listing (GET /api/operator/queues/:queueId/entries, QUEUE-007)', () => {
    it('returns queue entries in deterministic FIFO order: joinedAt ASC, id ASC (QUEUE-007)', async () => {
      const t0 = new Date('2026-11-13T09:00:00.000Z');
      const t1 = new Date('2026-11-13T09:05:00.000Z');

      // Insert out of chronological and UUID order to verify deterministic sorting
      const idB = '22222222-bbbb-4222-8222-222222222222';
      const idA = '11111111-aaaa-4111-8111-111111111111';
      const idC = '33333333-cccc-4333-8333-333333333333';

      // Entry C joined later (t1)
      await prisma.queueEntry.create({
        data: {
          id: idC,
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 3n,
          status: QueueStatus.WAITING,
          joinedAt: t1,
        },
      });

      // Entries B and A have identical joinedAt (t0); idA < idB should put idA first
      await prisma.queueEntry.create({
        data: {
          id: idB,
          customerId: CUSTOMER2.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 2n,
          status: QueueStatus.WAITING,
          joinedAt: t0,
        },
      });

      const extraUser = await prisma.user.create({
        data: {
          email: 'fifo_extra@example.com',
          passwordHash: 'hash',
          role: 'CUSTOMER',
          accountStatus: 'ACTIVE',
        },
      });

      await prisma.queueEntry.create({
        data: {
          id: idA,
          customerId: extraUser.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.CALLED,
          joinedAt: t0,
          calledAt: t1,
        },
      });

      const res = await request(app)
        .get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', operator1.cookieHeader);

      expect(res.status).toBe(200);
      const entries = res.body.data.entries;
      expect(entries).toHaveLength(3);
      expect(entries.map((e: { id: string }) => e.id)).toEqual([idA, idB, idC]);
      expect(entries.map((e: { queueNumber: number }) => e.queueNumber)).toEqual([1, 2, 3]);
    });

    it('returns 404 RESOURCE_NOT_FOUND for a non-existent queue and 400 INVALID_ARGUMENT for malformed UUID', async () => {
      const missingQueueId = '99999999-9999-4999-8999-999999999999';
      const notFoundRes = await request(app)
        .get(`/api/operator/queues/${missingQueueId}/entries`)
        .set('Cookie', operator1.cookieHeader);
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.error.code).toBe('RESOURCE_NOT_FOUND');

      const badUuidRes = await request(app)
        .get('/api/operator/queues/not-a-valid-uuid/entries')
        .set('Cookie', operator1.cookieHeader);
      expect(badUuidRes.status).toBe(400);
      expect(badUuidRes.body.error.code).toBe('INVALID_ARGUMENT');
    });
  });

  describe('3. Call Next Queue & Lifecycle Transitions (FLOW-001 to FLOW-007, FLOW-010)', () => {
    it('FLOW-001 & FLOW-002: selects oldest WAITING entry in FIFO order, transitions to CALLED, and sets calledAt', async () => {
      // Customer 1 joins first (#1), Customer 2 joins second (#2)
      const join1 = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', customer1.cookieHeader)
        .set('X-CSRF-Token', customer1.csrfToken);
      expect(join1.status).toBe(201);

      const join2 = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', customer2.cookieHeader)
        .set('X-CSRF-Token', customer2.csrfToken);
      expect(join2.status).toBe(201);

      // Operator 1 calls next -> must select Customer 1 (#1)
      const call1 = await request(app)
        .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);

      expect(call1.status).toBe(200);
      expect(call1.body.data.entry).toMatchObject({
        id: join1.body.data.entry.id,
        serviceQueueId: OPEN_QUEUE_ID,
        customerId: CUSTOMER1.id,
        queueNumber: 1,
        status: 'CALLED',
        serviceStartedAt: null,
        completedAt: null,
      });
      expect(typeof call1.body.data.entry.calledAt).toBe('string');
      expect(new Date(call1.body.data.entry.calledAt).getTime()).toBeGreaterThan(0);

      // Verify Customer 2 (#2) is still WAITING in DB
      const entry2InDb = await prisma.queueEntry.findUniqueOrThrow({
        where: { id: join2.body.data.entry.id },
      });
      expect(entry2InDb.status).toBe(QueueStatus.WAITING);
      expect(entry2InDb.calledAt).toBeNull();
    });

    it('FLOW-003: returns 204 No Content with empty body when queue has no WAITING entries', async () => {
      // Empty queue initially
      const emptyCall = await request(app)
        .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);

      expect(emptyCall.status).toBe(204);
      expect(emptyCall.text).toBe('');
      expect(emptyCall.body).toEqual({});

      // Insert a CALLED entry (not WAITING) and verify call-next still returns 204 without mutating it
      const calledEntry = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.CALLED,
          calledAt: new Date('2026-11-13T08:00:00.000Z'),
        },
      });

      const secondEmptyCall = await request(app)
        .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);

      expect(secondEmptyCall.status).toBe(204);
      const afterEntry = await prisma.queueEntry.findUniqueOrThrow({ where: { id: calledEntry.id } });
      expect(afterEntry.status).toBe(QueueStatus.CALLED);
      expect(afterEntry.calledAt?.toISOString()).toBe('2026-11-13T08:00:00.000Z');
    });

    it('FLOW-004, FLOW-006, FLOW-010: full operator lifecycle WAITING -> CALLED -> SERVING -> COMPLETED', async () => {
      // 1. Customer joins queue
      const joinRes = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', customer1.cookieHeader)
        .set('X-CSRF-Token', customer1.csrfToken);
      expect(joinRes.status).toBe(201);
      const entryId: string = joinRes.body.data.entry.id;

      // 2. Operator calls next (WAITING -> CALLED)
      const callRes = await request(app)
        .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(callRes.status).toBe(200);
      expect(callRes.body.data.entry.id).toBe(entryId);
      expect(callRes.body.data.entry.status).toBe('CALLED');
      const calledAt = callRes.body.data.entry.calledAt;
      expect(calledAt).toBeTruthy();

      // 3. Operator starts service (CALLED -> SERVING, FLOW-004)
      const startRes = await request(app)
        .post(`/api/operator/queue-entries/${entryId}/start`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(startRes.status).toBe(200);
      expect(startRes.body.data.entry).toMatchObject({
        id: entryId,
        status: 'SERVING',
        calledAt,
        completedAt: null,
      });
      const serviceStartedAt = startRes.body.data.entry.serviceStartedAt;
      expect(typeof serviceStartedAt).toBe('string');

      // 4. Operator completes service (SERVING -> COMPLETED, FLOW-006)
      const completeRes = await request(app)
        .post(`/api/operator/queue-entries/${entryId}/complete`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.entry).toMatchObject({
        id: entryId,
        status: 'COMPLETED',
        calledAt,
        serviceStartedAt,
      });
      expect(typeof completeRes.body.data.entry.completedAt).toBe('string');

      // Verify persisted database state matches API response
      const dbEntry = await prisma.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
      expect(dbEntry.status).toBe(QueueStatus.COMPLETED);
      expect(dbEntry.calledAt?.toISOString()).toBe(calledAt);
      expect(dbEntry.serviceStartedAt?.toISOString()).toBe(serviceStartedAt);
      expect(dbEntry.completedAt?.toISOString()).toBe(completeRes.body.data.entry.completedAt);
    });

    it('FLOW-005 & FLOW-007: rejects invalid and out-of-order lifecycle transitions with 409 INVALID_STATE_TRANSITION', async () => {
      // Create a WAITING entry
      const waitingEntry = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.WAITING,
        },
      });

      // 1. WAITING -> SERVING (skipping CALLED) must fail with 409
      const startOnWaiting = await request(app)
        .post(`/api/operator/queue-entries/${waitingEntry.id}/start`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(startOnWaiting.status).toBe(409);
      expect(startOnWaiting.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // 2. WAITING -> COMPLETED must fail with 409
      const completeOnWaiting = await request(app)
        .post(`/api/operator/queue-entries/${waitingEntry.id}/complete`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(completeOnWaiting.status).toBe(409);
      expect(completeOnWaiting.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // Transition to CALLED
      const callRes = await request(app)
        .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(callRes.status).toBe(200);

      // 3. CALLED -> COMPLETED (skipping SERVING) must fail with 409
      const completeOnCalled = await request(app)
        .post(`/api/operator/queue-entries/${waitingEntry.id}/complete`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(completeOnCalled.status).toBe(409);
      expect(completeOnCalled.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // Transition to SERVING
      const startRes = await request(app)
        .post(`/api/operator/queue-entries/${waitingEntry.id}/start`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(startRes.status).toBe(200);
      const originalStartedAt = startRes.body.data.entry.serviceStartedAt;

      // 4. SERVING -> SERVING (duplicate start) must fail with 409 and preserve serviceStartedAt
      const duplicateStart = await request(app)
        .post(`/api/operator/queue-entries/${waitingEntry.id}/start`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(duplicateStart.status).toBe(409);
      expect(duplicateStart.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // Transition to COMPLETED
      const completeRes = await request(app)
        .post(`/api/operator/queue-entries/${waitingEntry.id}/complete`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(completeRes.status).toBe(200);
      const originalCompletedAt = completeRes.body.data.entry.completedAt;

      // 5. COMPLETED -> SERVING (FLOW-007 terminal guard) must fail with 409
      const startOnCompleted = await request(app)
        .post(`/api/operator/queue-entries/${waitingEntry.id}/start`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(startOnCompleted.status).toBe(409);
      expect(startOnCompleted.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // 6. COMPLETED -> COMPLETED (FLOW-007 repeated completion) must fail with 409
      const repeatComplete = await request(app)
        .post(`/api/operator/queue-entries/${waitingEntry.id}/complete`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(repeatComplete.status).toBe(409);
      expect(repeatComplete.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // Verify timestamps were not mutated by rejected attempts
      const finalDb = await prisma.queueEntry.findUniqueOrThrow({ where: { id: waitingEntry.id } });
      expect(finalDb.status).toBe(QueueStatus.COMPLETED);
      expect(finalDb.serviceStartedAt?.toISOString()).toBe(originalStartedAt);
      expect(finalDb.completedAt?.toISOString()).toBe(originalCompletedAt);
    });

    it('returns 404 RESOURCE_NOT_FOUND for unknown entryId and 400 INVALID_ARGUMENT for malformed entryId on start and complete', async () => {
      const unknownEntryId = '99999999-9999-4999-8999-999999999999';

      const start404 = await request(app)
        .post(`/api/operator/queue-entries/${unknownEntryId}/start`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(start404.status).toBe(404);
      expect(start404.body.error.code).toBe('RESOURCE_NOT_FOUND');

      const complete404 = await request(app)
        .post(`/api/operator/queue-entries/${unknownEntryId}/complete`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(complete404.status).toBe(404);
      expect(complete404.body.error.code).toBe('RESOURCE_NOT_FOUND');

      const start400 = await request(app)
        .post('/api/operator/queue-entries/not-a-uuid/start')
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(start400.status).toBe(400);
      expect(start400.body.error.code).toBe('INVALID_ARGUMENT');

      const complete400 = await request(app)
        .post('/api/operator/queue-entries/not-a-uuid/complete')
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken);
      expect(complete400.status).toBe(400);
      expect(complete400.body.error.code).toBe('INVALID_ARGUMENT');
    });
  });

  describe('4. Authorization, RBAC & CSRF Enforcement (RBAC-001 to RBAC-004, SEC-002)', () => {
    it('RBAC-001: customer cannot call next (403 FORBIDDEN, no state mutation)', async () => {
      const waiting = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.WAITING,
        },
      });

      const res = await request(app)
        .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
        .set('Cookie', customer1.cookieHeader)
        .set('X-CSRF-Token', customer1.csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const after = await prisma.queueEntry.findUniqueOrThrow({ where: { id: waiting.id } });
      expect(after.status).toBe(QueueStatus.WAITING);
      expect(after.calledAt).toBeNull();
    });

    it('RBAC-002: customer cannot start service (403 FORBIDDEN, no state mutation)', async () => {
      const called = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.CALLED,
          calledAt: new Date(),
        },
      });

      const res = await request(app)
        .post(`/api/operator/queue-entries/${called.id}/start`)
        .set('Cookie', customer1.cookieHeader)
        .set('X-CSRF-Token', customer1.csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const after = await prisma.queueEntry.findUniqueOrThrow({ where: { id: called.id } });
      expect(after.status).toBe(QueueStatus.CALLED);
      expect(after.serviceStartedAt).toBeNull();
    });

    it('RBAC-003: customer cannot complete service (403 FORBIDDEN, no state mutation)', async () => {
      const serving = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.SERVING,
          calledAt: new Date(),
          serviceStartedAt: new Date(),
        },
      });

      const res = await request(app)
        .post(`/api/operator/queue-entries/${serving.id}/complete`)
        .set('Cookie', customer1.cookieHeader)
        .set('X-CSRF-Token', customer1.csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      const after = await prisma.queueEntry.findUniqueOrThrow({ where: { id: serving.id } });
      expect(after.status).toBe(QueueStatus.SERVING);
      expect(after.completedAt).toBeNull();
    });

    it('RBAC-004: operator cannot view entries, call-next, start, or complete on an unassigned queue (403 FORBIDDEN)', async () => {
      const waitingEntry = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.WAITING,
        },
      });

      const calledEntry = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER2.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 2n,
          status: QueueStatus.CALLED,
          calledAt: new Date(),
        },
      });

      // operator2 is NOT assigned to OPEN_QUEUE_ID; operator1 is NOT assigned to CLOSED_QUEUE_ID
      const listUnassigned1 = await request(app)
        .get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', operator2.cookieHeader);
      expect(listUnassigned1.status).toBe(403);
      expect(listUnassigned1.body.error.code).toBe('FORBIDDEN');

      const listUnassigned2 = await request(app)
        .get(`/api/operator/queues/${CLOSED_QUEUE_ID}/entries`)
        .set('Cookie', operator1.cookieHeader);
      expect(listUnassigned2.status).toBe(403);
      expect(listUnassigned2.body.error.code).toBe('FORBIDDEN');

      const callNextUnassigned = await request(app)
        .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
        .set('Cookie', operator2.cookieHeader)
        .set('X-CSRF-Token', operator2.csrfToken);
      expect(callNextUnassigned.status).toBe(403);
      expect(callNextUnassigned.body.error.code).toBe('FORBIDDEN');

      const startUnassigned = await request(app)
        .post(`/api/operator/queue-entries/${calledEntry.id}/start`)
        .set('Cookie', operator2.cookieHeader)
        .set('X-CSRF-Token', operator2.csrfToken);
      expect(startUnassigned.status).toBe(403);
      expect(startUnassigned.body.error.code).toBe('FORBIDDEN');

      const completeUnassigned = await request(app)
        .post(`/api/operator/queue-entries/${calledEntry.id}/complete`)
        .set('Cookie', operator2.cookieHeader)
        .set('X-CSRF-Token', operator2.csrfToken);
      expect(completeUnassigned.status).toBe(403);
      expect(completeUnassigned.body.error.code).toBe('FORBIDDEN');

      // Verify zero database side effects
      expect((await prisma.queueEntry.findUniqueOrThrow({ where: { id: waitingEntry.id } })).status).toBe(
        QueueStatus.WAITING
      );
      expect((await prisma.queueEntry.findUniqueOrThrow({ where: { id: calledEntry.id } })).status).toBe(
        QueueStatus.CALLED
      );
    });

    it('SEC-002: rejects operator mutations without a valid X-CSRF-Token with 403 FORBIDDEN', async () => {
      const entry = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.WAITING,
        },
      });

      const noCsrfCall = await request(app)
        .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
        .set('Cookie', operator1.cookieHeader);
      expect(noCsrfCall.status).toBe(403);
      expect(noCsrfCall.body.error.code).toBe('FORBIDDEN');

      const noCsrfStart = await request(app)
        .post(`/api/operator/queue-entries/${entry.id}/start`)
        .set('Cookie', operator1.cookieHeader);
      expect(noCsrfStart.status).toBe(403);
      expect(noCsrfStart.body.error.code).toBe('FORBIDDEN');

      const noCsrfComplete = await request(app)
        .post(`/api/operator/queue-entries/${entry.id}/complete`)
        .set('Cookie', operator1.cookieHeader);
      expect(noCsrfComplete.status).toBe(403);
      expect(noCsrfComplete.body.error.code).toBe('FORBIDDEN');

      // Entry remains untouched
      const after = await prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(after.status).toBe(QueueStatus.WAITING);
    });
  });

  describe('5. Concurrency Safety (CONCURRENCY-003, CONCURRENCY-004)', () => {
    it('CONCURRENCY-003: concurrent call-next requests claim distinct WAITING entries without duplicates', async () => {
      // Assign operator2 to OPEN_QUEUE_ID as well so two operators can call next concurrently
      await prisma.operatorAssignment.create({
        data: {
          operatorId: OPERATOR2.id,
          serviceQueueId: OPEN_QUEUE_ID,
        },
      });

      // Seed 4 WAITING entries in FIFO order
      const baseTime = new Date('2026-11-13T10:00:00.000Z');
      const createdEntryIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        const cust = await prisma.user.create({
          data: {
            email: `concurrent_wait_${i}_${Date.now()}@example.com`,
            passwordHash: 'hash',
            role: 'CUSTOMER',
            accountStatus: 'ACTIVE',
          },
        });
        const entry = await prisma.queueEntry.create({
          data: {
            customerId: cust.id,
            serviceQueueId: OPEN_QUEUE_ID,
            queueNumber: BigInt(i + 1),
            status: QueueStatus.WAITING,
            joinedAt: new Date(baseTime.getTime() + i * 1000),
          },
        });
        createdEntryIds.push(entry.id);
      }

      // Fire 6 concurrent call-next requests across operator1 and operator2 against 4 WAITING entries
      const actors = [operator1, operator2, operator1, operator2, operator1, operator2];
      const responses = await Promise.all(
        actors.map((actor) =>
          request(app)
            .post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
            .set('Cookie', actor.cookieHeader)
            .set('X-CSRF-Token', actor.csrfToken)
        )
      );

      const okResponses = responses.filter((r) => r.status === 200);
      const emptyResponses = responses.filter((r) => r.status === 204);

      // Exactly 4 must succeed with 200 OK, and 2 must return 204 No Content
      expect(okResponses).toHaveLength(4);
      expect(emptyResponses).toHaveLength(2);

      // Each of the 4 waiting entries must be claimed exactly once (no duplicate assignment)
      const claimedIds = okResponses.map((r) => r.body.data.entry.id).sort();
      expect(claimedIds).toEqual([...createdEntryIds].sort());

      // Verify all 4 entries are CALLED in the database with calledAt populated
      const dbEntries = await prisma.queueEntry.findMany({
        where: { serviceQueueId: OPEN_QUEUE_ID },
        orderBy: { queueNumber: 'asc' },
      });
      expect(dbEntries).toHaveLength(4);
      for (const row of dbEntries) {
        expect(row.status).toBe(QueueStatus.CALLED);
        expect(row.calledAt).not.toBeNull();
      }
    });

    it('CONCURRENCY-004: concurrent start and complete requests on the same entry succeed once and return 409 for stale requests', async () => {
      await prisma.operatorAssignment.create({
        data: {
          operatorId: OPERATOR2.id,
          serviceQueueId: OPEN_QUEUE_ID,
        },
      });

      const entry = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.CALLED,
          calledAt: new Date(),
        },
      });

      // Fire 5 concurrent start requests on the same CALLED entry
      const startResponses = await Promise.all(
        [operator1, operator2, operator1, operator2, operator1].map((actor) =>
          request(app)
            .post(`/api/operator/queue-entries/${entry.id}/start`)
            .set('Cookie', actor.cookieHeader)
            .set('X-CSRF-Token', actor.csrfToken)
        )
      );

      const startSuccess = startResponses.filter((r) => r.status === 200);
      const startConflict = startResponses.filter((r) => r.status === 409);

      expect(startSuccess).toHaveLength(1);
      expect(startConflict).toHaveLength(4);
      for (const conflict of startConflict) {
        expect(conflict.body.error.code).toBe('INVALID_STATE_TRANSITION');
      }

      // Now fire 5 concurrent complete requests on the same SERVING entry
      const completeResponses = await Promise.all(
        [operator1, operator2, operator1, operator2, operator1].map((actor) =>
          request(app)
            .post(`/api/operator/queue-entries/${entry.id}/complete`)
            .set('Cookie', actor.cookieHeader)
            .set('X-CSRF-Token', actor.csrfToken)
        )
      );

      const completeSuccess = completeResponses.filter((r) => r.status === 200);
      const completeConflict = completeResponses.filter((r) => r.status === 409);

      expect(completeSuccess).toHaveLength(1);
      expect(completeConflict).toHaveLength(4);
      for (const conflict of completeConflict) {
        expect(conflict.body.error.code).toBe('INVALID_STATE_TRANSITION');
      }

      const finalEntry = await prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(finalEntry.status).toBe(QueueStatus.COMPLETED);
      expect(finalEntry.serviceStartedAt?.toISOString()).toBe(
        startSuccess[0].body.data.entry.serviceStartedAt
      );
      expect(finalEntry.completedAt?.toISOString()).toBe(
        completeSuccess[0].body.data.entry.completedAt
      );
    });
  });
});

