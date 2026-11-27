/**
 * F-08 No-show handling and recovery: API + real PostgreSQL integration tests.
 * Test IDs NOSHOW-002 – NOSHOW-014 and NOSHOW-020 from docs/sprints/sprint-2/tests.md §7.1.
 * Contract: docs/sprints/sprint-2/api-spec.md §9, docs/features/sprint-2-f08-no-show-recovery.md.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/db';
import {
  resetAndSeed,
  login,
  CUSTOMER1,
  OPERATOR1,
  CUSTOMER2,
  OPERATOR2,
  OPEN_QUEUE_ID,
  type LoggedIn,
} from './helpers/auth';

const UNKNOWN_V4 = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

interface RowSnapshot {
  status: string;
  queueNumber: bigint;
  joinedAt: Date;
  calledAt: Date | null;
  serviceStartedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  recoveredAt: Date | null;
  noShowCount: number;
}

/** Raw read so the test does not depend on the generated Prisma client knowing the new columns. */
async function row(id: string): Promise<RowSnapshot | undefined> {
  const rows = await prisma.$queryRaw<RowSnapshot[]>`
    SELECT "status"::text AS status, "queueNumber", "joinedAt", "calledAt", "serviceStartedAt", "completedAt",
           "cancelledAt", "noShowAt", "recoveredAt", "noShowCount"
    FROM "QueueEntry" WHERE "id" = ${id}::uuid`;
  return rows[0];
}

function join(user: LoggedIn, queueId = OPEN_QUEUE_ID) {
  return request(app).post(`/api/queues/${queueId}/entries`).set('Cookie', user.cookieHeader).set('X-CSRF-Token', user.csrfToken);
}

function post(user: LoggedIn | null, path: string, csrf: string | null | undefined = user?.csrfToken) {
  const req = request(app).post(path);
  if (user) req.set('Cookie', user.cookieHeader);
  return typeof csrf === 'string' ? req.set('X-CSRF-Token', csrf) : req;
}

const noShow = (user: LoggedIn | null, id: string, csrf?: string | null) =>
  post(user, `/api/operator/queue-entries/${id}/no-show`, csrf === undefined ? user?.csrfToken : csrf);
const recover = (user: LoggedIn | null, id: string, csrf?: string | null) =>
  post(user, `/api/operator/queue-entries/${id}/recover`, csrf === undefined ? user?.csrfToken : csrf);
const callNext = (op: LoggedIn) => post(op, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
const start = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/start`);
const complete = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/complete`);
const cancel = (user: LoggedIn, id: string) => post(user, `/api/me/queue-entries/${id}/cancel`);

async function joined(user: LoggedIn): Promise<{ id: string; queueNumber: number; joinedAt: string }> {
  const res = await join(user);
  expect(res.status, 'join').toBe(201);
  return res.body.data.entry;
}

async function calledNext(op: LoggedIn, expectedId: string): Promise<void> {
  const res = await callNext(op);
  expect(res.status, 'call-next').toBe(200);
  expect(res.body.data.entry.id, 'call-next picked the expected entry').toBe(expectedId);
}

async function markedNoShow(op: LoggedIn, id: string): Promise<void> {
  const res = await noShow(op, id);
  expect(res.status, 'no-show').toBe(200);
}

async function aheadCount(user: LoggedIn, id: string): Promise<number> {
  const res = await request(app).get(`/api/me/queue-entries/${id}`).set('Cookie', user.cookieHeader);
  expect(res.status).toBe(200);
  return res.body.data.entry.aheadCount;
}

async function makeCustomer(email: string): Promise<LoggedIn> {
  const seeded = await prisma.user.findUniqueOrThrow({ where: { id: CUSTOMER1.id } });
  await prisma.user.create({ data: { email, passwordHash: seeded.passwordHash, role: 'CUSTOMER', accountStatus: 'ACTIVE' } });
  return login(app, email);
}

/** tests.md §7.3 plus the §4 checks. */
async function assertInvariants(): Promise<void> {
  const bad = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "QueueEntry" WHERE NOT (
      ("status" <> 'NO_SHOW' OR ("noShowAt" IS NOT NULL AND "calledAt" IS NOT NULL AND "noShowCount" >= 1
                                 AND "serviceStartedAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL))
      AND (("noShowCount" = 0) = ("noShowAt" IS NULL))
      AND ("recoveredAt" IS NULL OR "noShowCount" >= 1)
      AND ("noShowCount" < 2 OR "recoveredAt" IS NOT NULL)
      AND ("status" <> 'WAITING' OR "calledAt" IS NULL)
    )`;
  expect(bad, 'rows violating the F-08 row invariants').toEqual([]);

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

describe('F-08: no-show handling and recovery', () => {
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

  /** customer1 joins, operator1 calls it: a CALLED entry. */
  async function calledEntry(): Promise<{ id: string; queueNumber: number; joinedAt: string }> {
    const a = await joined(customer1);
    await calledNext(operator1, a.id);
    return a;
  }

  /** customer1's entry, called and marked no-show once. */
  async function noShowEntry(): Promise<{ id: string; queueNumber: number; joinedAt: string }> {
    const a = await calledEntry();
    await markedNoShow(operator1, a.id);
    return a;
  }

  it('NOSHOW-002 (AC-25): the assigned operator marks a CALLED entry NO_SHOW; UTC noShowAt, count 1, persisted', async () => {
    const a = await calledEntry();
    const before = await row(a.id);

    const res = await noShow(operator1, a.id);

    expect(res.status).toBe(200);
    const body = res.body.data.entry;
    expect(body).toMatchObject({
      id: a.id,
      queueNumber: a.queueNumber,
      status: 'NO_SHOW',
      joinedAt: a.joinedAt,
      calledAt: before!.calledAt!.toISOString(),
      serviceStartedAt: null,
      completedAt: null,
      cancelledAt: null,
      recoveredAt: null,
      noShowCount: 1,
    });
    expect(body.noShowAt).toMatch(RFC3339_UTC);
    expect(new Date(body.noShowAt).getTime()).toBeGreaterThanOrEqual(before!.calledAt!.getTime());

    const stored = await row(a.id);
    expect(stored?.status).toBe('NO_SHOW');
    expect(stored?.noShowAt?.toISOString()).toBe(body.noShowAt);
    expect(stored?.noShowCount).toBe(1);
    expect(stored?.calledAt?.toISOString()).toBe(before!.calledAt!.toISOString());

    const own = await request(app).get(`/api/me/queue-entries/${a.id}`).set('Cookie', customer1.cookieHeader);
    expect(own.status).toBe(200);
    expect(own.body.data.entry).toMatchObject({ status: 'NO_SHOW', aheadCount: 0, noShowCount: 1, noShowAt: body.noShowAt });
  });

  it('NOSHOW-002 (AC-25): marking no-show also works when the queue is CLOSED', async () => {
    const a = await calledEntry();
    await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { availability: 'CLOSED' } });
    const res = await noShow(operator1, a.id);
    expect(res.status).toBe(200);
    expect(res.body.data.entry.status).toBe('NO_SHOW');
  });

  it('NOSHOW-003 (AC-26): marking no-show is rejected for WAITING, SERVING, COMPLETED, CANCELLED and NO_SHOW', async () => {
    const customer3 = await makeCustomer('customer3@example.test');
    const customer4 = await makeCustomer('customer4@example.test');
    const customer5 = await makeCustomer('customer5@example.test');

    const serving = await joined(customer1);
    await calledNext(operator1, serving.id);
    expect((await start(operator1, serving.id)).status).toBe(200);

    const completed = await joined(customer2);
    await calledNext(operator1, completed.id);
    expect((await start(operator1, completed.id)).status).toBe(200);
    expect((await complete(operator1, completed.id)).status).toBe(200);

    const missed = await joined(customer3);
    await calledNext(operator1, missed.id);
    await markedNoShow(operator1, missed.id);

    const cancelled = await joined(customer4);
    expect((await cancel(customer4, cancelled.id)).status).toBe(200);

    const waiting = await joined(customer5);

    for (const id of [waiting.id, serving.id, completed.id, cancelled.id, missed.id]) {
      const before = await row(id);
      const res = await noShow(operator1, id);
      expect(res.status, `no-show on ${before?.status}`).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(await row(id)).toEqual(before);
    }
  });

  it('NOSHOW-020 (AC-26): Start and Complete reject a NO_SHOW entry', async () => {
    const a = await noShowEntry();
    const before = await row(a.id);
    for (const res of [await start(operator1, a.id), await complete(operator1, a.id)]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    }
    expect(await row(a.id)).toEqual(before);
  });

  /** NOSHOW-004 / NOSHOW-005: the same eight callers for either action. */
  async function expectAccessControl(action: typeof noShow, id: string): Promise<void> {
    const before = await row(id);
    const cases: Array<[string, () => request.Test, number, string]> = [
      ['unassigned operator', () => action(operator2, id), 403, 'FORBIDDEN'],
      ['owning customer', () => action(customer1, id), 403, 'FORBIDDEN'],
      ['other customer', () => action(customer2, id), 403, 'FORBIDDEN'],
      ['no session', () => action(null, id, null), 401, 'UNAUTHORIZED'],
      ['missing CSRF', () => action(operator1, id, null), 403, 'FORBIDDEN'],
      ['wrong CSRF', () => action(operator1, id, 'not-the-token'), 403, 'FORBIDDEN'],
      ['malformed id', () => action(operator1, 'not-a-uuid'), 400, 'INVALID_ARGUMENT'],
      ['unknown id', () => action(operator1, UNKNOWN_V4), 404, 'RESOURCE_NOT_FOUND'],
    ];
    for (const [name, send, status, code] of cases) {
      const res = await send();
      expect(res.status, name).toBe(status);
      expect(res.body.error?.code, name).toBe(code);
      expect(await row(id), `${name}: row unchanged`).toEqual(before);
    }
  }

  it('NOSHOW-004 (AC-27): no-show is restricted to the assigned operator; every other caller is rejected', async () => {
    const a = await calledEntry();
    await expectAccessControl(noShow, a.id);
  });

  it('NOSHOW-005 (AC-27): recover is restricted to the assigned operator; every other caller is rejected', async () => {
    const a = await noShowEntry();
    await expectAccessControl(recover, a.id);
  });

  it('NOSHOW-006 (AC-28): a returned entry is WAITING at its original FIFO position and is called before later joiners', async () => {
    const customer3 = await makeCustomer('customer3@example.test');
    const a = await joined(customer1);
    const b = await joined(customer2);
    const c = await joined(customer3);
    await calledNext(operator1, a.id);
    await markedNoShow(operator1, a.id);
    await calledNext(operator1, b.id);
    expect(await aheadCount(customer3, c.id)).toBe(0);
    const missed = await row(a.id);

    const res = await recover(operator1, a.id);

    expect(res.status).toBe(200);
    const body = res.body.data.entry;
    expect(body).toMatchObject({
      id: a.id,
      status: 'WAITING',
      queueNumber: a.queueNumber,
      joinedAt: a.joinedAt,
      calledAt: null,
      noShowCount: 1,
      noShowAt: missed!.noShowAt!.toISOString(),
    });
    expect(body.recoveredAt).toMatch(RFC3339_UTC);
    expect(new Date(body.recoveredAt).getTime()).toBeGreaterThanOrEqual(missed!.noShowAt!.getTime());

    const stored = await row(a.id);
    expect(stored?.status).toBe('WAITING');
    expect(stored?.calledAt).toBeNull();
    expect(stored?.recoveredAt?.toISOString()).toBe(body.recoveredAt);
    expect(stored?.joinedAt.toISOString()).toBe(a.joinedAt);

    expect(await aheadCount(customer3, c.id)).toBe(1);
    expect(await aheadCount(customer1, a.id)).toBe(0);
    await calledNext(operator1, a.id);
    await calledNext(operator1, c.id);
  });

  it('NOSHOW-006 (AC-28): a return also works when the queue is CLOSED', async () => {
    const a = await noShowEntry();
    await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { availability: 'CLOSED' } });
    const res = await recover(operator1, a.id);
    expect(res.status).toBe(200);
    expect(res.body.data.entry.status).toBe('WAITING');
  });

  it('NOSHOW-007 (AC-29): a second no-show is final (RECOVERY_LIMIT_REACHED); other states are invalid for a return', async () => {
    const a = await noShowEntry();
    expect((await recover(operator1, a.id)).status).toBe(200);
    await calledNext(operator1, a.id);
    const second = await noShow(operator1, a.id);
    expect(second.status).toBe(200);
    expect(second.body.data.entry.noShowCount).toBe(2);
    const final = await row(a.id);
    expect(final?.noShowAt?.toISOString()).toBe(second.body.data.entry.noShowAt);
    expect(final?.recoveredAt).not.toBeNull();

    const limited = await recover(operator1, a.id);
    expect(limited.status).toBe(409);
    expect(limited.body.error.code).toBe('RECOVERY_LIMIT_REACHED');
    expect(await row(a.id)).toEqual(final);

    // Other states: WAITING, CALLED, SERVING, COMPLETED, CANCELLED.
    const customer3 = await makeCustomer('customer3@example.test');
    const customer4 = await makeCustomer('customer4@example.test');
    const customer5 = await makeCustomer('customer5@example.test');
    const completed = await joined(customer2);
    await calledNext(operator1, completed.id);
    expect((await start(operator1, completed.id)).status).toBe(200);
    expect((await complete(operator1, completed.id)).status).toBe(200);
    const serving = await joined(customer3);
    await calledNext(operator1, serving.id);
    expect((await start(operator1, serving.id)).status).toBe(200);
    const calledE = await joined(customer4);
    await calledNext(operator1, calledE.id);
    const cancelled = await joined(customer5);
    expect((await cancel(customer5, cancelled.id)).status).toBe(200);
    const waiting = await joined(customer2);

    for (const id of [waiting.id, calledE.id, serving.id, completed.id, cancelled.id]) {
      const before = await row(id);
      const res = await recover(operator1, id);
      expect(res.status, `recover on ${before?.status}`).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(await row(id)).toEqual(before);
    }
  });

  it('NOSHOW-008 (AC-29): the database keeps noShowCount between 0 and 2; the active-entry index is unchanged', async () => {
    const a = await joined(customer1);
    for (const value of [3, -1]) {
      let error: unknown;
      try {
        await prisma.$executeRaw`UPDATE "QueueEntry" SET "noShowCount" = ${value} WHERE "id" = ${a.id}::uuid`;
      } catch (err) {
        error = err;
      }
      expect(error, `noShowCount = ${value} must be rejected`).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(String((error as Error).message)).toMatch(/23514|check constraint/i);
    }
    const constraint = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'QueueEntry_noShowCount_range_check'`;
    expect(constraint).toHaveLength(1);
    expect(constraint[0].def).toMatch(/"noShowCount" >= 0/);
    expect(constraint[0].def).toMatch(/"noShowCount" <= 2/);

    const index = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'QueueEntry_active_customer_queue_uidx'`;
    expect(index).toHaveLength(1);
    expect(index[0].indexdef).toContain('("customerId", "serviceQueueId")');
    const states = [...index[0].indexdef.matchAll(/'(\w+)'::"QueueStatus"/g)].map((m) => m[1]);
    expect(states).toEqual(['WAITING', 'CALLED', 'SERVING']);
  });

  it('NOSHOW-009 (AC-30): a customer may rejoin while NO_SHOW; the old entry can then no longer be returned', async () => {
    const a = await noShowEntry();
    const rejoin = await join(customer1);
    expect(rejoin.status).toBe(201);
    expect(rejoin.body.data.entry.status).toBe('WAITING');
    expect(rejoin.body.data.entry.queueNumber).toBeGreaterThan(a.queueNumber);

    const before = await row(a.id);
    const res = await recover(operator1, a.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_ACTIVE_ENTRY');
    expect(await row(a.id)).toEqual(before);
  });

  it('NOSHOW-010 (AC-30): a NO_SHOW entry cannot be cancelled; after a return it can (F-07)', async () => {
    const a = await noShowEntry();
    const before = await row(a.id);
    const first = await cancel(customer1, a.id);
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await row(a.id)).toEqual(before);

    expect((await recover(operator1, a.id)).status).toBe(200);
    const second = await cancel(customer1, a.id);
    expect(second.status).toBe(200);
    const stored = await row(a.id);
    expect(stored?.status).toBe('CANCELLED');
    expect(stored?.calledAt).toBeNull();
    expect(stored?.noShowAt?.toISOString()).toBe(before?.noShowAt?.toISOString());
  });

  it('NOSHOW-011 (AC-31): Call Next skips NO_SHOW, the operator list shows it, and aheadCount ignores it', async () => {
    const customer3 = await makeCustomer('customer3@example.test');
    const a = await joined(customer1);
    const b = await joined(customer2);
    await calledNext(operator1, a.id);
    await markedNoShow(operator1, a.id);
    const c = await joined(customer3);
    const missed = await row(a.id);

    expect(await aheadCount(customer3, c.id)).toBe(1);

    const list = await request(app).get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`).set('Cookie', operator1.cookieHeader);
    expect(list.status).toBe(200);
    const entries = list.body.data.entries as Array<Record<string, unknown>>;
    expect(entries.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
    expect(entries[0]).toMatchObject({ status: 'NO_SHOW', noShowCount: 1, recoveredAt: null, noShowAt: missed!.noShowAt!.toISOString() });
    expect(entries[1]).toMatchObject({ noShowAt: null, recoveredAt: null, noShowCount: 0 });

    await calledNext(operator1, b.id);
    await calledNext(operator1, c.id);
    const empty = await callNext(operator1);
    expect(empty.status).toBe(204);
    expect(empty.text).toBe('');
    expect(await row(a.id)).toEqual(missed);
  });

  it('NOSHOW-012 (AC-32): no-show vs Start on the same CALLED entry, 10 rounds: exactly one wins', async () => {
    const outcomes = { noShow: 0, start: 0 };
    for (let round = 0; round < 10; round += 1) {
      await prisma.queueEntry.deleteMany({});
      const a = await calledEntry();
      const [n, s] = await Promise.all([noShow(operator1, a.id), start(operator1, a.id)]);
      const statuses = [n.status, s.status].sort();
      expect(statuses, `round ${round}`).toEqual([200, 409]);
      const loser = n.status === 409 ? n : s;
      expect(loser.body.error.code).toBe('INVALID_STATE_TRANSITION');
      const stored = await row(a.id);
      if (n.status === 200) {
        outcomes.noShow += 1;
        expect(stored?.status).toBe('NO_SHOW');
        expect(stored?.serviceStartedAt).toBeNull();
      } else {
        outcomes.start += 1;
        expect(stored?.status).toBe('SERVING');
        expect(stored?.noShowAt).toBeNull();
        expect(stored?.noShowCount).toBe(0);
      }
    }
    console.log(`NOSHOW-012 outcomes: no-show won ${outcomes.noShow}, start won ${outcomes.start}`);
  });

  it('NOSHOW-013 (AC-32): two parallel returns of one NO_SHOW entry, 10 rounds: exactly one 200', async () => {
    for (let round = 0; round < 10; round += 1) {
      await prisma.queueEntry.deleteMany({});
      const a = await noShowEntry();
      const results = await Promise.all([recover(operator1, a.id), recover(operator1, a.id)]);
      expect(results.map((r) => r.status).sort(), `round ${round}`).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.error.code).toBe('INVALID_STATE_TRANSITION');
      const winner = results.find((r) => r.status === 200)!;
      const stored = await row(a.id);
      expect(stored?.status).toBe('WAITING');
      expect(stored?.recoveredAt?.toISOString()).toBe(winner.body.data.entry.recoveredAt);
    }
  });

  it('NOSHOW-014 (AC-32): a return and a rejoin by the same customer in parallel, 10 rounds: never two active entries', async () => {
    const outcomes = { recover: 0, join: 0 };
    for (let round = 0; round < 10; round += 1) {
      await prisma.queueEntry.deleteMany({});
      const a = await noShowEntry();
      const [r, j] = await Promise.all([recover(operator1, a.id), join(customer1)]);
      if (r.status === 200) {
        outcomes.recover += 1;
        expect(j.status, `round ${round}: join after the return`).toBe(409);
        expect(j.body.error.code).toBe('DUPLICATE_ACTIVE_ENTRY');
      } else {
        outcomes.join += 1;
        expect(j.status, `round ${round}: join first`).toBe(201);
        expect(r.status).toBe(409);
        expect(r.body.error.code).toBe('DUPLICATE_ACTIVE_ENTRY');
        expect((await row(a.id))?.status).toBe('NO_SHOW');
      }
      const active = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*)::bigint AS n FROM "QueueEntry"
        WHERE "customerId" = ${CUSTOMER1.id}::uuid AND "status" IN ('WAITING', 'CALLED', 'SERVING')`;
      expect(Number(active[0].n), `round ${round}: active entries`).toBe(1);
    }
    console.log(`NOSHOW-014 outcomes: return won ${outcomes.recover}, join won ${outcomes.join}`);
  });

  /** Two extra OPEN queues for the BR-06 tests; operator1 is assigned to Q2 so it can complete there. */
  async function extraQueues(): Promise<{ q2: string; q3: string }> {
    const q2 = await prisma.serviceQueue.create({ data: { name: 'NOSHOW BR-06 Queue 2', availability: 'OPEN' } });
    const q3 = await prisma.serviceQueue.create({ data: { name: 'NOSHOW BR-06 Queue 3', availability: 'OPEN' } });
    await prisma.operatorAssignment.create({ data: { operatorId: OPERATOR1.id, serviceQueueId: q2.id } });
    return { q2: q2.id, q3: q3.id };
  }

  async function activeCount(customerId: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM "QueueEntry"
      WHERE "customerId" = ${customerId}::uuid AND "status" IN ('WAITING', 'CALLED', 'SERVING')`;
    return Number(rows[0].n);
  }

  it('NOSHOW-021 (AC-45): a return is rejected at the BR-06 cap and allowed once a slot is free', async () => {
    const { q2, q3 } = await extraQueues();
    const a = await noShowEntry();
    const inQ2 = await join(customer1, q2);
    expect(inQ2.status, 'join Q2').toBe(201);
    expect((await join(customer1, q3)).status, 'join Q3').toBe(201);
    expect(await activeCount(CUSTOMER1.id)).toBe(2);

    const before = await row(a.id);
    const blocked = await recover(operator1, a.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('MAX_ACTIVE_ENTRIES_REACHED');
    expect(await row(a.id), 'A unchanged').toEqual(before);
    expect(await activeCount(CUSTOMER1.id)).toBe(2);

    const q2Entry = inQ2.body.data.entry.id as string;
    expect((await post(operator1, `/api/operator/queues/${q2}/call-next`)).status).toBe(200);
    expect((await start(operator1, q2Entry)).status).toBe(200);
    expect((await complete(operator1, q2Entry)).status).toBe(200);

    const ok = await recover(operator1, a.id);
    expect(ok.status).toBe(200);
    expect(ok.body.data.entry.status).toBe('WAITING');
    expect(await activeCount(CUSTOMER1.id)).toBe(2);
  });

  it('NOSHOW-022 (AC-45): a return and a join of a third queue in parallel, 10 rounds: never 3 active entries', async () => {
    const { q2, q3 } = await extraQueues();
    const outcomes = { recover: 0, join: 0 };
    for (let round = 0; round < 10; round += 1) {
      await prisma.queueEntry.deleteMany({});
      const a = await noShowEntry();
      expect((await join(customer1, q2)).status, `round ${round}: join Q2`).toBe(201);
      const [r, j] = await Promise.all([recover(operator1, a.id), join(customer1, q3)]);
      if (r.status === 200) {
        outcomes.recover += 1;
        expect(j.status, `round ${round}: join after the return`).toBe(409);
        expect(j.body.error.code).toBe('MAX_ACTIVE_ENTRIES_REACHED');
      } else {
        outcomes.join += 1;
        expect(j.status, `round ${round}: join first`).toBe(201);
        expect(r.status, `round ${round}: return after the join`).toBe(409);
        expect(r.body.error.code).toBe('MAX_ACTIVE_ENTRIES_REACHED');
        expect((await row(a.id))?.status).toBe('NO_SHOW');
      }
      expect(await activeCount(CUSTOMER1.id), `round ${round}: active entries`).toBe(2);
    }
    console.log(`NOSHOW-022 outcomes: return won ${outcomes.recover}, join won ${outcomes.join}`);
  });
});
