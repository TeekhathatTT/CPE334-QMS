import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { createSession } from '../src/auth/session';
import {
  resetAndSeed,
  login,
  CUSTOMER1,
  OPERATOR1,
  OPEN_QUEUE_ID,
  CLOSED_QUEUE_ID,
  SEED_PASSWORD,
} from './helpers/auth';
import { Role, AccountStatus, QueueStatus } from '@prisma/client';

describe('Issue #4: Service Queue Creation & Queue Number Generation', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    await resetAndSeed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Service Queue Discovery (GET /api/queues)', () => {
    it('returns only OPEN queues for authenticated customers (QUEUE-001)', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      const res = await request(app)
        .get('/api/queues')
        .set('Cookie', custAuth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data.queues');
      expect(Array.isArray(res.body.data.queues)).toBe(true);

      const queues = res.body.data.queues;
      expect(queues.length).toBeGreaterThan(0);

      // Verify all returned queues have availability OPEN
      for (const q of queues) {
        expect(q.availability).toBe('OPEN');
        expect(q).toHaveProperty('id');
        expect(q).toHaveProperty('name');
        expect(q).toHaveProperty('description');
      }

      // Verify the seeded CLOSED queue is excluded
      const closed = queues.find((q: { id: string }) => q.id === CLOSED_QUEUE_ID);
      expect(closed).toBeUndefined();

      // Verify the seeded OPEN queue is present
      const open = queues.find((q: { id: string }) => q.id === OPEN_QUEUE_ID);
      expect(open).toBeDefined();
      expect(open.name).toBe('General Inquiry Desk');
    });

    it('returns OPEN queues for authenticated operators as well (api-spec §7.1)', async () => {
      const opAuth = await login(app, OPERATOR1.email);

      const res = await request(app)
        .get('/api/queues')
        .set('Cookie', opAuth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.queues.length).toBeGreaterThan(0);
      expect(res.body.data.queues.every((q: { availability: string }) => q.availability === 'OPEN')).toBe(true);
    });

    it('returns 401 UNAUTHORIZED for anonymous requests', async () => {
      const res = await request(app).get('/api/queues');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Normal Queue Registration (POST /api/queues/:queueId/entries)', () => {
    it('successfully joins an OPEN queue and allocates queueNumber 1 (QUEUE-002, NUMBER-001)', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      const res = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('data.entry');

      const entry = res.body.data.entry;
      expect(entry.id).toBeDefined();
      expect(entry.serviceQueueId).toBe(OPEN_QUEUE_ID);
      expect(entry.customerId).toBe(CUSTOMER1.id);
      expect(entry.queueNumber).toBe(1);
      expect(entry.status).toBe('WAITING');
      expect(entry.joinedAt).toBeDefined();
      expect(entry.calledAt).toBeNull();
      expect(entry.serviceStartedAt).toBeNull();
      expect(entry.completedAt).toBeNull();

      // Verify database state
      const dbQueue = await prisma.serviceQueue.findUnique({
        where: { id: OPEN_QUEUE_ID },
      });
      expect(dbQueue?.lastQueueNumber).toBe(1n);

      const dbEntry = await prisma.queueEntry.findUnique({
        where: { id: entry.id },
      });
      expect(dbEntry?.queueNumber).toBe(1n);
      expect(dbEntry?.status).toBe(QueueStatus.WAITING);
    });

    it('rejects join request for a CLOSED queue with 409 QUEUE_NOT_AVAILABLE (QUEUE-004)', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      const res = await request(app)
        .post(`/api/queues/${CLOSED_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);

      expect(res.status).toBe(409);
      expect(res.body.data).toBeUndefined();
      expect(res.body.error.code).toBe('QUEUE_NOT_AVAILABLE');

      // Verify no row was inserted
      const count = await prisma.queueEntry.count({
        where: { serviceQueueId: CLOSED_QUEUE_ID },
      });
      expect(count).toBe(0);
    });

    it('returns 404 RESOURCE_NOT_FOUND when joining a non-existent queue', async () => {
      const custAuth = await login(app, CUSTOMER1.email);
      const nonExistentQueue = '99999999-9999-4999-8999-999999999999';

      const res = await request(app)
        .post(`/api/queues/${nonExistentQueue}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 400 INVALID_ARGUMENT when :queueId is not a valid UUIDv4', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      const res = await request(app)
        .post('/api/queues/not-a-valid-uuid/entries')
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
    });

    it('rejects operator role from joining a queue with 403 FORBIDDEN (RBAC-001)', async () => {
      const opAuth = await login(app, OPERATOR1.email);

      const res = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', opAuth.cookieHeader)
        .set('X-CSRF-Token', opAuth.csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects join request with missing X-CSRF-Token with 403 FORBIDDEN (SEC-002)', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      const res = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader);
      // Omit X-CSRF-Token

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 401 UNAUTHORIZED for unauthenticated join requests', async () => {
      const res = await request(app).post(`/api/queues/${OPEN_QUEUE_ID}/entries`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('3. Duplicate Prevention & Re-entry', () => {
    it('rejects duplicate active join in the same queue with 409 DUPLICATE_ACTIVE_ENTRY (QUEUE-003)', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      // First join succeeds
      const res1 = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);
      expect(res1.status).toBe(201);

      // Second join while first is WAITING must fail
      const res2 = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);
      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('DUPLICATE_ACTIVE_ENTRY');

      // Verify lastQueueNumber was NOT incremented on the rejected attempt
      const dbQueue = await prisma.serviceQueue.findUnique({ where: { id: OPEN_QUEUE_ID } });
      expect(dbQueue?.lastQueueNumber).toBe(1n);
    });

    it('rejects duplicate join when customer has an entry in CALLED or SERVING status', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      // Create an entry in SERVING status directly
      await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 10n,
          status: QueueStatus.SERVING,
        },
      });

      // Attempting to join while SERVING must fail
      const res = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_ACTIVE_ENTRY');
    });

    it('permits rejoin after previous entry is COMPLETED and allocates next monotonic number (QUEUE-005)', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      // First join -> queueNumber 1
      const res1 = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);
      expect(res1.status).toBe(201);
      const entry1Id = res1.body.data.entry.id;

      // Mark first entry as COMPLETED
      await prisma.queueEntry.update({
        where: { id: entry1Id },
        data: {
          status: QueueStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      // Rejoin now succeeds with queueNumber 2
      const res2 = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);

      expect(res2.status).toBe(201);
      expect(res2.body.data.entry.queueNumber).toBe(2);
      expect(res2.body.data.entry.status).toBe('WAITING');
    });

    it('allows a customer to hold active entries across distinct queues simultaneously (QUEUE-008)', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      // Create a second OPEN queue for testing multi-queue join
      const secondOpenQueue = await prisma.serviceQueue.create({
        data: {
          name: 'Express Help Desk',
          availability: 'OPEN',
          lastQueueNumber: 0n,
        },
      });

      // Join Queue 1
      const res1 = await request(app)
        .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);
      expect(res1.status).toBe(201);

      // Join Queue 2 (must succeed because it is a different queue)
      const res2 = await request(app)
        .post(`/api/queues/${secondOpenQueue.id}/entries`)
        .set('Cookie', custAuth.cookieHeader)
        .set('X-CSRF-Token', custAuth.csrfToken);
      expect(res2.status).toBe(201);

      // Verify both entries exist as WAITING in DB
      const activeEntries = await prisma.queueEntry.findMany({
        where: { customerId: CUSTOMER1.id, status: QueueStatus.WAITING },
      });
      expect(activeEntries).toHaveLength(2);
    });
  });

  describe('4. Concurrency Safety (CONCURRENCY-001, CONCURRENCY-002)', () => {
    it('allocates strictly contiguous unique queue numbers under concurrent join requests from multiple customers', async () => {
      const concurrentUsersCount = 8;
      const customers: Array<{ id: string; cookieHeader: string; csrfToken: string }> = [];

      // Create 8 distinct test customer accounts and sessions
      for (let i = 0; i < concurrentUsersCount; i++) {
        const user = await prisma.user.create({
          data: {
            email: `concurrent_user_${i}_${Date.now()}@example.com`,
            passwordHash: 'dummy_hash',
            role: Role.CUSTOMER,
            accountStatus: AccountStatus.ACTIVE,
          },
        });
        const session = await createSession(user.id);
        customers.push({
          id: user.id,
          cookieHeader: `qms_session=${session.rawToken}; qms_csrf=${session.csrfToken}`,
          csrfToken: session.csrfToken,
        });
      }

      // Fire concurrent requests simultaneously
      const responses = await Promise.all(
        customers.map((c) =>
          request(app)
            .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
            .set('Cookie', c.cookieHeader)
            .set('X-CSRF-Token', c.csrfToken)
        )
      );

      // Assert all requests succeeded with 201
      for (const res of responses) {
        expect(res.status).toBe(201);
      }

      // Extract queue numbers
      const allocatedNumbers = responses.map((r) => r.body.data.entry.queueNumber);
      allocatedNumbers.sort((a, b) => a - b);

      // Assert contiguous sequence from 1 to 8 with NO duplicates
      expect(allocatedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      // Assert database counter matches exactly 8
      const dbQueue = await prisma.serviceQueue.findUnique({ where: { id: OPEN_QUEUE_ID } });
      expect(dbQueue?.lastQueueNumber).toBe(BigInt(concurrentUsersCount));
    });

    it('handles concurrent duplicate join attempts by the same customer: exactly one succeeds and rest receive 409', async () => {
      const custAuth = await login(app, CUSTOMER1.email);
      const attemptsCount = 5;

      // Fire 5 identical requests simultaneously for the same customer
      const responses = await Promise.all(
        Array.from({ length: attemptsCount }).map(() =>
          request(app)
            .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
            .set('Cookie', custAuth.cookieHeader)
            .set('X-CSRF-Token', custAuth.csrfToken)
        )
      );

      const statusCounts = responses.reduce<Record<number, number>>((acc, res) => {
        acc[res.status] = (acc[res.status] || 0) + 1;
        return acc;
      }, {});

      // Exactly ONE must succeed (201) and all others must fail with 409 DUPLICATE_ACTIVE_ENTRY
      expect(statusCounts[201]).toBe(1);
      expect(statusCounts[409]).toBe(attemptsCount - 1);

      // Verify exactly one active row exists in DB
      const dbEntries = await prisma.queueEntry.findMany({
        where: { customerId: CUSTOMER1.id, serviceQueueId: OPEN_QUEUE_ID },
      });
      expect(dbEntries).toHaveLength(1);
      expect(dbEntries[0].queueNumber).toBe(1n);

      // Counter in DB should be 1
      const dbQueue = await prisma.serviceQueue.findUnique({ where: { id: OPEN_QUEUE_ID } });
      expect(dbQueue?.lastQueueNumber).toBe(1n);
    });
  });

  describe('5. Customer Queue Entries Listing & Entry Detail with FIFO aheadCount', () => {
    it('lists customer entries in joinedAt DESC order including completed history (GET /api/me/queue-entries)', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      // Entry 1 joined earlier
      const entry1 = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.COMPLETED,
          joinedAt: new Date(Date.now() - 60000),
          completedAt: new Date(),
        },
      });

      // Entry 2 joined later
      const entry2 = await prisma.queueEntry.create({
        data: {
          customerId: CUSTOMER1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 2n,
          status: QueueStatus.WAITING,
          joinedAt: new Date(),
        },
      });

      const res = await request(app)
        .get('/api/me/queue-entries')
        .set('Cookie', custAuth.cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data.entries');
      const entries = res.body.data.entries;

      expect(entries).toHaveLength(2);
      // Ordered by joinedAt DESC: entry2 first, then entry1
      expect(entries[0].id).toBe(entry2.id);
      expect(entries[0].queueNumber).toBe(2);
      expect(entries[1].id).toBe(entry1.id);
      expect(entries[1].queueNumber).toBe(1);
    });

    it('calculates deterministic FIFO aheadCount accurately for WAITING entries', async () => {
      const baseTime = new Date('2026-11-12T10:00:00.000Z');

      // Create 3 customers
      const userA = await prisma.user.create({
        data: { email: 'ahead_a@example.com', passwordHash: 'h', role: Role.CUSTOMER, accountStatus: 'ACTIVE' },
      });
      const userB = await prisma.user.create({
        data: { email: 'ahead_b@example.com', passwordHash: 'h', role: Role.CUSTOMER, accountStatus: 'ACTIVE' },
      });
      const userC = await prisma.user.create({
        data: { email: 'ahead_c@example.com', passwordHash: 'h', role: Role.CUSTOMER, accountStatus: 'ACTIVE' },
      });

      // User A arrives at T+0s (WAITING)
      const entryA = await prisma.queueEntry.create({
        data: {
          customerId: userA.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.WAITING,
          joinedAt: new Date(baseTime.getTime()),
        },
      });

      // User B arrives at T+10s (WAITING)
      const entryB = await prisma.queueEntry.create({
        data: {
          customerId: userB.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 2n,
          status: QueueStatus.WAITING,
          joinedAt: new Date(baseTime.getTime() + 10000),
        },
      });

      // User C arrives at T+20s (WAITING)
      const entryC = await prisma.queueEntry.create({
        data: {
          customerId: userC.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 3n,
          status: QueueStatus.WAITING,
          joinedAt: new Date(baseTime.getTime() + 20000),
        },
      });

      // Check User A (front of line): aheadCount should be 0
      const sessionA = await createSession(userA.id);
      const resA = await request(app)
        .get(`/api/me/queue-entries/${entryA.id}`)
        .set('Cookie', `qms_session=${sessionA.rawToken}; qms_csrf=${sessionA.csrfToken}`);
      expect(resA.status).toBe(200);
      expect(resA.body.data.entry.aheadCount).toBe(0);

      // Check User B: aheadCount should be 1 (User A is ahead)
      const sessionB = await createSession(userB.id);
      const resB = await request(app)
        .get(`/api/me/queue-entries/${entryB.id}`)
        .set('Cookie', `qms_session=${sessionB.rawToken}; qms_csrf=${sessionB.csrfToken}`);
      expect(resB.status).toBe(200);
      expect(resB.body.data.entry.aheadCount).toBe(1);

      // Check User C: aheadCount should be 2 (Users A and B are ahead)
      const sessionC = await createSession(userC.id);
      const resC = await request(app)
        .get(`/api/me/queue-entries/${entryC.id}`)
        .set('Cookie', `qms_session=${sessionC.rawToken}; qms_csrf=${sessionC.csrfToken}`);
      expect(resC.status).toBe(200);
      expect(resC.body.data.entry.aheadCount).toBe(2);

      // Now User A gets CALLED by operator -> User B aheadCount drops to 0!
      await prisma.queueEntry.update({
        where: { id: entryA.id },
        data: { status: QueueStatus.CALLED, calledAt: new Date() },
      });

      const resBAfter = await request(app)
        .get(`/api/me/queue-entries/${entryB.id}`)
        .set('Cookie', `qms_session=${sessionB.rawToken}; qms_csrf=${sessionB.csrfToken}`);
      expect(resBAfter.body.data.entry.aheadCount).toBe(0);

      // User C aheadCount drops from 2 to 1 (only B is WAITING ahead)
      const resCAfter = await request(app)
        .get(`/api/me/queue-entries/${entryC.id}`)
        .set('Cookie', `qms_session=${sessionC.rawToken}; qms_csrf=${sessionC.csrfToken}`);
      expect(resCAfter.body.data.entry.aheadCount).toBe(1);
    });

    it('enforces tie-breaker id ASC ordering when joinedAt timestamps are identical', async () => {
      const sameTimestamp = new Date('2026-11-12T12:00:00.000Z');

      const user1 = await prisma.user.create({
        data: { email: 'tie_1@example.com', passwordHash: 'h', role: Role.CUSTOMER, accountStatus: 'ACTIVE' },
      });
      const user2 = await prisma.user.create({
        data: { email: 'tie_2@example.com', passwordHash: 'h', role: Role.CUSTOMER, accountStatus: 'ACTIVE' },
      });

      // Entry 1 has smaller UUID string than Entry 2
      const id1 = '11111111-aaaa-4111-8111-111111111111';
      const id2 = '22222222-bbbb-4222-8222-222222222222';

      await prisma.queueEntry.create({
        data: {
          id: id1,
          customerId: user1.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: QueueStatus.WAITING,
          joinedAt: sameTimestamp,
        },
      });

      await prisma.queueEntry.create({
        data: {
          id: id2,
          customerId: user2.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 2n,
          status: QueueStatus.WAITING,
          joinedAt: sameTimestamp,
        },
      });

      // User 2 query: User 1 is ahead because id1 < id2
      const session2 = await createSession(user2.id);
      const res2 = await request(app)
        .get(`/api/me/queue-entries/${id2}`)
        .set('Cookie', `qms_session=${session2.rawToken}; qms_csrf=${session2.csrfToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.entry.aheadCount).toBe(1);

      // User 1 query: aheadCount is 0
      const session1 = await createSession(user1.id);
      const res1 = await request(app)
        .get(`/api/me/queue-entries/${id1}`)
        .set('Cookie', `qms_session=${session1.rawToken}; qms_csrf=${session1.csrfToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.entry.aheadCount).toBe(0);
    });

    it('masks cross-owner entry lookup as 404 RESOURCE_NOT_FOUND (RBAC-005, QUEUE-006)', async () => {
      const cust1Auth = await login(app, CUSTOMER1.email);

      // Customer 2 creates an entry
      const otherUser = await prisma.user.findFirst({
        where: { email: 'customer2@example.com' },
      });
      const otherEntry = await prisma.queueEntry.create({
        data: {
          customerId: otherUser!.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 50n,
          status: QueueStatus.WAITING,
        },
      });

      // Customer 1 tries to read Customer 2's entry -> returns 404 (never leaks existence or 403)
      const res = await request(app)
        .get(`/api/me/queue-entries/${otherEntry.id}`)
        .set('Cookie', cust1Auth.cookieHeader);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 400 INVALID_ARGUMENT when entryId is malformed', async () => {
      const custAuth = await login(app, CUSTOMER1.email);

      const res = await request(app)
        .get('/api/me/queue-entries/invalid-entry-uuid')
        .set('Cookie', custAuth.cookieHeader);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
    });

    it('rejects operator role on /api/me/queue-entries with 403 FORBIDDEN', async () => {
      const opAuth = await login(app, OPERATOR1.email);

      const res = await request(app)
        .get('/api/me/queue-entries')
        .set('Cookie', opAuth.cookieHeader);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});

