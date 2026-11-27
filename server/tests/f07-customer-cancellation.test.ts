/**
 * F-07 Customer cancellation and queue withdrawal: API + real PostgreSQL integration tests.
 * Test IDs CANCEL-002 – CANCEL-015 and CANCEL-020 from docs/sprints/sprint-2/tests.md.
 * Contract: docs/sprints/sprint-2/api-spec.md §3.1, docs/features/sprint-2-f07-customer-cancellation.md.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/db';
import {
  resetAndSeed,
  login,
  withoutRequestId,
  CUSTOMER1,
  CUSTOMER2,
  OPERATOR1,
  OPERATOR2,
  OPEN_QUEUE_ID,
  type LoggedIn,
} from './helpers/auth';

const UNKNOWN_V4 = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const UUID_V1 = 'a3bb189e-8bf9-11ee-b9d1-0242ac120002';
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

interface RowSnapshot {
  status: string;
  queueNumber: bigint;
  calledAt: Date | null;
  serviceStartedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

/** Raw read so the test does not depend on the generated Prisma client knowing the new column. */
async function row(id: string): Promise<RowSnapshot | undefined> {
  const rows = await prisma.$queryRaw<RowSnapshot[]>`
    SELECT "status"::text AS status, "queueNumber", "calledAt", "serviceStartedAt", "completedAt", "cancelledAt"
    FROM "QueueEntry" WHERE "id" = ${id}::uuid`;
  return rows[0];
}

function join(user: LoggedIn, queueId = OPEN_QUEUE_ID) {
  return request(app).post(`/api/queues/${queueId}/entries`).set('Cookie', user.cookieHeader).set('X-CSRF-Token', user.csrfToken);
}

function cancel(user: LoggedIn, entryId: string, csrf: string | null = user.csrfToken) {
  const req = request(app).post(`/api/me/queue-entries/${entryId}/cancel`).set('Cookie', user.cookieHeader);
  return csrf === null ? req : req.set('X-CSRF-Token', csrf);
}

function operatorPost(op: LoggedIn, path: string) {
  return request(app).post(path).set('Cookie', op.cookieHeader).set('X-CSRF-Token', op.csrfToken);
}

async function joinedId(user: LoggedIn): Promise<{ id: string; queueNumber: number; joinedAt: string }> {
  const res = await join(user);
  expect(res.status, 'join').toBe(201);
  return res.body.data.entry;
}

/** tests.md §4: row invariants that must hold after every scenario. */
async function assertInvariants(): Promise<void> {
  const bad = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "QueueEntry" WHERE NOT (
      ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "calledAt" IS NULL AND "serviceStartedAt" IS NULL AND "completedAt" IS NULL)
      OR ("status" <> 'CANCELLED' AND "cancelledAt" IS NULL)
    )`;
  expect(bad, 'rows violating the CANCELLED <=> cancelledAt invariant').toEqual([]);

  const activeDupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "customerId", "serviceQueueId" FROM "QueueEntry"
      WHERE "status" IN ('WAITING', 'CALLED', 'SERVING')
      GROUP BY "customerId", "serviceQueueId" HAVING COUNT(*) > 1
    ) d`;
  expect(Number(activeDupes[0].n), 'two active entries for one (customer, queue)').toBe(0);

  const numberDupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "serviceQueueId", "queueNumber" FROM "QueueEntry"
      GROUP BY "serviceQueueId", "queueNumber" HAVING COUNT(*) > 1
    ) d`;
  expect(Number(numberDupes[0].n), 'duplicate (serviceQueueId, queueNumber)').toBe(0);
}

describe('F-07: customer cancellation (POST /api/me/queue-entries/:entryId/cancel)', () => {
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

  afterEach(async () => {
    await assertInvariants();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('CANCEL-002 (AC-17): the owner cancels a WAITING entry; CANCELLED + UTC cancelledAt, persisted, row kept', async () => {
    const entry = await joinedId(customer1);
    const countBefore = await prisma.queueEntry.count({ where: { customerId: CUSTOMER1.id } });

    const res = await cancel(customer1, entry.id);

    expect(res.status).toBe(200);
    const body = res.body.data.entry;
    expect(body).toMatchObject({
      id: entry.id,
      serviceQueueId: OPEN_QUEUE_ID,
      customerId: CUSTOMER1.id,
      queueNumber: entry.queueNumber,
      status: 'CANCELLED',
      joinedAt: entry.joinedAt,
      calledAt: null,
      serviceStartedAt: null,
      completedAt: null,
      aheadCount: 0,
    });
    expect(body.cancelledAt).toMatch(RFC3339_UTC);
    expect(new Date(body.cancelledAt).getTime()).toBeGreaterThanOrEqual(new Date(entry.joinedAt).getTime());

    // Fresh read from the database: same values, row not deleted.
    const stored = await row(entry.id);
    expect(stored?.status).toBe('CANCELLED');
    expect(stored?.cancelledAt?.toISOString()).toBe(body.cancelledAt);
    expect(Number(stored?.queueNumber)).toBe(entry.queueNumber);
    expect(await prisma.queueEntry.count({ where: { customerId: CUSTOMER1.id } })).toBe(countBefore);
  });

  it('CANCEL-003 (AC-18): cancelling a CALLED, SERVING, COMPLETED or CANCELLED entry is 409 INVALID_STATE_TRANSITION and changes nothing', async () => {
    const first = await joinedId(customer1);

    const expectRejected = async (entryId: string, state: string) => {
      const before = await row(entryId);
      expect(before?.status).toBe(state);
      const res = await cancel(customer1, entryId);
      expect(res.status, `cancel ${state}`).toBe(409);
      expect(res.body.error.code, `cancel ${state}`).toBe('INVALID_STATE_TRANSITION');
      expect(await row(entryId), `${state} row unchanged`).toEqual(before);
    };

    expect((await operatorPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)).status).toBe(200);
    await expectRejected(first.id, 'CALLED');
    expect((await operatorPost(operator1, `/api/operator/queue-entries/${first.id}/start`)).status).toBe(200);
    await expectRejected(first.id, 'SERVING');
    expect((await operatorPost(operator1, `/api/operator/queue-entries/${first.id}/complete`)).status).toBe(200);
    await expectRejected(first.id, 'COMPLETED');

    // A repeated cancel is not an idempotent success.
    const second = await joinedId(customer1);
    expect((await cancel(customer1, second.id)).status).toBe(200);
    await expectRejected(second.id, 'CANCELLED');
  });

  it('CANCEL-004 (AC-19): a non-owner customer gets the same 404 as an unknown id, and the entry is unchanged', async () => {
    const entry = await joinedId(customer1);
    const before = await row(entry.id);

    const res = await cancel(customer2, entry.id);
    const unknown = await cancel(customer2, UNKNOWN_V4);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(withoutRequestId(res.body)).toEqual(withoutRequestId(unknown.body));
    expect(await row(entry.id)).toEqual(before);
    expect(before?.cancelledAt).toBeNull();

    // The 404 above is about ownership, not a missing route: the owner can cancel the same entry.
    expect((await cancel(customer1, entry.id)).status).toBe(200);
  });

  it('CANCEL-005 (AC-19): an operator (assigned or not) gets 403 FORBIDDEN, and the entry is unchanged', async () => {
    const entry = await joinedId(customer1);
    const before = await row(entry.id);

    for (const op of [operator1, operator2]) {
      const res = await cancel(op, entry.id);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await row(entry.id)).toEqual(before);
  });

  it('CANCEL-006 (AC-19): no session or a logged-out session gets 401, and the entry is unchanged', async () => {
    const entry = await joinedId(customer1);
    const before = await row(entry.id);

    const anonymous = await request(app).post(`/api/me/queue-entries/${entry.id}/cancel`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');

    const logout = await request(app).post('/api/auth/logout').set('Cookie', customer1.cookieHeader).set('X-CSRF-Token', customer1.csrfToken);
    expect(logout.status).toBe(204);
    const loggedOut = await cancel(customer1, entry.id);
    expect(loggedOut.status).toBe(401);
    expect(loggedOut.body.error.code).toBe('UNAUTHORIZED');

    expect(await row(entry.id)).toEqual(before);
  });

  it('CANCEL-007 (AC-19): a missing or wrong CSRF token gets 403 FORBIDDEN, and the entry is unchanged', async () => {
    const entry = await joinedId(customer1);
    const before = await row(entry.id);

    const missing = await cancel(customer1, entry.id, null);
    const wrong = await cancel(customer1, entry.id, 'not-the-session-token');

    for (const res of [missing, wrong]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await row(entry.id)).toEqual(before);
  });

  it('CANCEL-008 (AC-19): malformed ids are 400 INVALID_ARGUMENT; an unknown UUIDv4 is 404 RESOURCE_NOT_FOUND', async () => {
    const entry = await joinedId(customer1);
    const before = await row(entry.id);

    for (const bad of ['not-a-uuid', UUID_V1]) {
      const res = await cancel(customer1, bad);
      expect(res.status, bad).toBe(400);
      expect(res.body.error.code, bad).toBe('INVALID_ARGUMENT');
    }
    const unknown = await cancel(customer1, UNKNOWN_V4);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('RESOURCE_NOT_FOUND');

    expect(await row(entry.id)).toEqual(before);
  });

  it('CANCEL-009 (AC-20): an entry in a queue that is now CLOSED can still be cancelled', async () => {
    const entry = await joinedId(customer1);
    await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { availability: 'CLOSED' } });

    const res = await cancel(customer1, entry.id);

    expect(res.status).toBe(200);
    expect(res.body.data.entry.status).toBe('CANCELLED');
    expect((await row(entry.id))?.status).toBe('CANCELLED');
  });

  it('CANCEL-010 (AC-21): after cancelling, the customer rejoins the same queue with a new, larger number', async () => {
    const first = await joinedId(customer1);
    expect((await cancel(customer1, first.id)).status).toBe(200);

    const rejoin = await join(customer1);

    expect(rejoin.status).toBe(201);
    const second = rejoin.body.data.entry;
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('WAITING');
    expect(second.cancelledAt).toBeNull();
    expect(second.queueNumber).toBeGreaterThan(first.queueNumber);

    const old = await row(first.id);
    expect(old?.status).toBe('CANCELLED');
    expect(Number(old?.queueNumber)).toBe(first.queueNumber);
    const queue = await prisma.serviceQueue.findUniqueOrThrow({ where: { id: OPEN_QUEUE_ID } });
    expect(Number(queue.lastQueueNumber)).toBe(second.queueNumber);
  });

  it('CANCEL-011 (AC-21): the active-entry guard still holds, and the partial unique index definition is unchanged', async () => {
    const first = await joinedId(customer1);
    expect((await cancel(customer1, first.id)).status).toBe(200);
    await joinedId(customer1);

    // (a) API guard
    const third = await join(customer1);
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('DUPLICATE_ACTIVE_ENTRY');

    // (b) database guard: a second WAITING row for the same customer and queue is rejected
    let dbError: unknown;
    try {
      await prisma.queueEntry.create({
        data: { customerId: CUSTOMER1.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: BigInt(999), status: 'WAITING' },
      });
    } catch (err) {
      dbError = err;
    }
    expect(dbError).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((dbError as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');

    // (c) the index predicate still lists exactly the three active states
    const idx = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'QueueEntry_active_customer_queue_uidx'`;
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toMatch(/^CREATE UNIQUE INDEX/);
    expect(idx[0].indexdef).toContain('("customerId", "serviceQueueId")');
    const states = [...idx[0].indexdef.matchAll(/'(\w+)'::"QueueStatus"/g)].map((m) => m[1]);
    expect(states).toEqual(['WAITING', 'CALLED', 'SERVING']);
  });

  it('CANCEL-012 (AC-22): a cancelled entry is skipped by Call Next, hidden from the operator list, and FIFO is kept', async () => {
    const seeded = await prisma.user.findUniqueOrThrow({ where: { id: CUSTOMER1.id } });
    await prisma.user.create({
      data: { email: 'customer3@example.test', passwordHash: seeded.passwordHash, role: 'CUSTOMER', accountStatus: 'ACTIVE' },
    });
    const customer3 = await login(app, 'customer3@example.test');

    const a = await joinedId(customer1);
    const b = await joinedId(customer2);
    const c = await joinedId(customer3);

    const aheadOfC = async () => {
      const res = await request(app).get(`/api/me/queue-entries/${c.id}`).set('Cookie', customer3.cookieHeader);
      expect(res.status).toBe(200);
      return res.body.data.entry.aheadCount;
    };
    expect(await aheadOfC()).toBe(2);

    expect((await cancel(customer2, b.id)).status).toBe(200);
    expect(await aheadOfC()).toBe(1);

    const list = await request(app).get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`).set('Cookie', operator1.cookieHeader);
    expect(list.status).toBe(200);
    expect(list.body.data.entries.map((e: { id: string }) => e.id)).toEqual([a.id, c.id]);

    const call1 = await operatorPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
    const call2 = await operatorPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
    expect(call1.status).toBe(200);
    expect(call1.body.data.entry.id).toBe(a.id);
    expect(call2.status).toBe(200);
    expect(call2.body.data.entry.id).toBe(c.id);

    const bRow = await row(b.id);
    expect(bRow?.status).toBe('CANCELLED');
    expect(bRow?.calledAt).toBeNull();
  });

  it('CANCEL-013 (AC-22): Call Next on a queue whose only entry was cancelled returns 204 and changes nothing', async () => {
    const entry = await joinedId(customer1);
    expect((await cancel(customer1, entry.id)).status).toBe(200);
    const before = await row(entry.id);

    const res = await operatorPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await row(entry.id)).toEqual(before);
  });

  it('CANCEL-014 (AC-23): cancel vs Call Next on the same entry; exactly one transition is applied (15 rounds)', async () => {
    const outcomes = { cancelWon: 0, callWon: 0 };
    for (let round = 0; round < 15; round++) {
      await prisma.queueEntry.deleteMany({});
      const entry = await joinedId(customer1);

      const [c, n] = await Promise.all([
        cancel(customer1, entry.id),
        operatorPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`),
      ]);
      const stored = await row(entry.id);

      if (c.status === 200) {
        outcomes.cancelWon++;
        expect(n.status, `round ${round}: call-next after a winning cancel`).toBe(204);
        expect(stored?.status).toBe('CANCELLED');
        expect(stored?.cancelledAt).not.toBeNull();
        expect(stored?.calledAt).toBeNull();
      } else {
        outcomes.callWon++;
        expect(c.status, `round ${round}: losing cancel`).toBe(409);
        expect(['INVALID_STATE_TRANSITION', 'CONCURRENT_MODIFICATION']).toContain(c.body.error.code);
        expect(n.status, `round ${round}: winning call-next`).toBe(200);
        expect(n.body.data.entry.id).toBe(entry.id);
        expect(stored?.status).toBe('CALLED');
        expect(stored?.calledAt).not.toBeNull();
        expect(stored?.cancelledAt).toBeNull();
      }
      expect(await prisma.queueEntry.count({}), `round ${round}: no extra rows`).toBe(1);
      await assertInvariants();
    }
    // Both outcomes are valid; the counts are printed for the evidence log only.
    console.log(`[CANCEL-014] cancel won ${outcomes.cancelWon}, call-next won ${outcomes.callWon} of 15 rounds`);
  });

  it('CANCEL-015 (AC-17): own-entry reads still return the cancelled entry and its history', async () => {
    const cancelled = await joinedId(customer1);
    const cancelRes = await cancel(customer1, cancelled.id);
    expect(cancelRes.status).toBe(200);
    const rejoined = await joinedId(customer1);

    const list = await request(app).get('/api/me/queue-entries').set('Cookie', customer1.cookieHeader);
    expect(list.status).toBe(200);
    const entries = list.body.data.entries;
    expect(entries.map((e: { id: string }) => e.id)).toEqual([rejoined.id, cancelled.id]);
    expect(entries[1]).toMatchObject({ status: 'CANCELLED', cancelledAt: cancelRes.body.data.entry.cancelledAt });
    expect(entries[0]).toMatchObject({ status: 'WAITING', cancelledAt: null });

    const detail = await request(app).get(`/api/me/queue-entries/${cancelled.id}`).set('Cookie', customer1.cookieHeader);
    expect(detail.status).toBe(200);
    expect(detail.body.data.entry).toMatchObject({
      id: cancelled.id,
      status: 'CANCELLED',
      aheadCount: 0,
      cancelledAt: cancelRes.body.data.entry.cancelledAt,
    });
  });

  it('CANCEL-020 (AC-23): two parallel cancels of one entry give exactly one 200 and one 409 (10 rounds)', async () => {
    for (let round = 0; round < 10; round++) {
      await prisma.queueEntry.deleteMany({});
      const entry = await joinedId(customer1);

      const results = await Promise.all([cancel(customer1, entry.id), cancel(customer1, entry.id)]);

      expect(results.map((r) => r.status).sort(), `round ${round}`).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(['INVALID_STATE_TRANSITION', 'CONCURRENT_MODIFICATION']).toContain(loser.body.error.code);
      const winner = results.find((r) => r.status === 200)!;
      expect((await row(entry.id))?.cancelledAt?.toISOString()).toBe(winner.body.data.entry.cancelledAt);
      await assertInvariants();
    }
  });
});
