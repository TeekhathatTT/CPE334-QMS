/**
 * F-09 Multi-counter support: API + real PostgreSQL integration & concurrency tests.
 * Test IDs COUNTER-002 – COUNTER-013 from docs/sprints/sprint-2/tests.md §8.1.
 * Contract: docs/sprints/sprint-2/api-spec.md §12–§16, docs/features/sprint-2-f09-multi-counter.md.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { seed } from '../prisma/seed';
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

const COUNTER_Q1_1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const COUNTER_Q1_2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const COUNTER_Q2_1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const COUNTER_Q2_2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const UNKNOWN_V4 = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

interface EntryRowSnapshot {
  id: string;
  serviceQueueId: string;
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
  counterId: string | null;
}

interface CounterRowSnapshot {
  id: string;
  serviceQueueId: string;
  name: string;
  status: string;
  assignedOperatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Raw SQL snapshots so tests compile cleanly in Red phase before Prisma schema/client changes. */
async function entryRow(id: string): Promise<EntryRowSnapshot | undefined> {
  const rows = await prisma.$queryRaw<EntryRowSnapshot[]>`
    SELECT "id", "serviceQueueId", "status"::text AS status, "queueNumber", "joinedAt", "calledAt",
           "serviceStartedAt", "completedAt", "cancelledAt", "noShowAt", "recoveredAt", "noShowCount", "counterId"
    FROM "QueueEntry"
    WHERE "id" = ${id}::uuid`;
  return rows[0];
}

async function counterRow(id: string): Promise<CounterRowSnapshot | undefined> {
  const rows = await prisma.$queryRaw<CounterRowSnapshot[]>`
    SELECT "id", "serviceQueueId", "name", "status"::text AS status, "assignedOperatorId", "createdAt", "updatedAt"
    FROM "Counter"
    WHERE "id" = ${id}::uuid`;
  return rows[0];
}

function get(user: LoggedIn | null, path: string) {
  const req = request(app).get(path);
  if (user) req.set('Cookie', user.cookieHeader);
  return req;
}

function post(user: LoggedIn | null, path: string, csrf: string | null | undefined = user?.csrfToken) {
  const req = request(app).post(path);
  if (user) req.set('Cookie', user.cookieHeader);
  return typeof csrf === 'string' ? req.set('X-CSRF-Token', csrf) : req;
}

function patch(
  user: LoggedIn | null,
  path: string,
  body: Record<string, unknown>,
  csrf: string | null | undefined = user?.csrfToken
) {
  const req = request(app).patch(path);
  if (user) req.set('Cookie', user.cookieHeader);
  if (typeof csrf === 'string') req.set('X-CSRF-Token', csrf);
  return req.send(body);
}

const listCounters = (user: LoggedIn | null, queueId = OPEN_QUEUE_ID) =>
  get(user, `/api/operator/queues/${queueId}/counters`);

const updateCounterStatus = (
  user: LoggedIn | null,
  counterId: string,
  body: Record<string, unknown>,
  csrf?: string | null
) => patch(user, `/api/operator/counters/${counterId}/status`, body, csrf === undefined ? user?.csrfToken : csrf);

const counterCallNext = (user: LoggedIn | null, counterId: string, csrf?: string | null) =>
  post(user, `/api/operator/counters/${counterId}/call-next`, csrf === undefined ? user?.csrfToken : csrf);

const legacyCallNext = (op: LoggedIn, queueId = OPEN_QUEUE_ID) =>
  post(op, `/api/operator/queues/${queueId}/call-next`);

const join = (user: LoggedIn, queueId = OPEN_QUEUE_ID) =>
  post(user, `/api/queues/${queueId}/entries`);

const start = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/start`);
const complete = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/complete`);
const noShow = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/no-show`);
const recover = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/recover`);
const cancel = (user: LoggedIn, id: string) => post(user, `/api/me/queue-entries/${id}/cancel`);

async function joined(user: LoggedIn, queueId = OPEN_QUEUE_ID): Promise<{ id: string; queueNumber: number; joinedAt: string }> {
  const res = await join(user, queueId);
  expect(res.status, 'join').toBe(201);
  return res.body.data.entry;
}

async function makeOperator(email: string, assignQueueId?: string): Promise<{ id: string; session: LoggedIn }> {
  const seeded = await prisma.user.findUniqueOrThrow({ where: { id: OPERATOR1.id } });
  const created = await prisma.user.create({
    data: { email, passwordHash: seeded.passwordHash, role: 'OPERATOR', accountStatus: 'ACTIVE' },
  });
  if (assignQueueId) {
    await prisma.operatorAssignment.create({
      data: { operatorId: created.id, serviceQueueId: assignQueueId },
    });
  }
  return { id: created.id, session: await login(app, email) };
}

/** Row invariants from docs/sprints/sprint-2/tests.md §8.3 plus §4 and §7.3. */
async function assertInvariants(): Promise<void> {
  const badWaitingOrCancelled = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "QueueEntry"
    WHERE "status" IN ('WAITING', 'CANCELLED') AND "counterId" IS NOT NULL`;
  expect(badWaitingOrCancelled, 'WAITING/CANCELLED rows with non-null counterId').toEqual([]);

  const badCrossQueue = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT e."id"
    FROM "QueueEntry" e
    JOIN "Counter" c ON c."id" = e."counterId"
    WHERE c."serviceQueueId" <> e."serviceQueueId"`;
  expect(badCrossQueue, 'entries referencing a counter from another queue').toEqual([]);

  const activeDupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "customerId", "serviceQueueId" FROM "QueueEntry"
      WHERE "status" IN ('WAITING', 'CALLED', 'SERVING')
      GROUP BY "customerId", "serviceQueueId" HAVING COUNT(*) > 1
    ) d`;
  expect(Number(activeDupes[0].n), 'duplicate active entries').toBe(0);

  const numberDupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "serviceQueueId", "queueNumber" FROM "QueueEntry"
      GROUP BY "serviceQueueId", "queueNumber" HAVING COUNT(*) > 1
    ) d`;
  expect(Number(numberDupes[0].n), 'duplicate (serviceQueueId, queueNumber)').toBe(0);
}

describe('F-09: multi-counter support', () => {
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

  it('COUNTER-002 (AC-35): assigned operator lists queue counters in deterministic name ASC, id ASC order', async () => {
    const res = await listCounters(operator1, OPEN_QUEUE_ID);

    expect(res.status).toBe(200);
    const counters = res.body.data.counters as Array<Record<string, unknown>>;
    expect(counters).toHaveLength(2);
    expect(counters[0]).toMatchObject({
      id: COUNTER_Q1_1,
      serviceQueueId: OPEN_QUEUE_ID,
      name: 'Counter 1',
      status: 'OPEN',
      assignedOperatorId: null,
    });
    expect(counters[1]).toMatchObject({
      id: COUNTER_Q1_2,
      serviceQueueId: OPEN_QUEUE_ID,
      name: 'Counter 2',
      status: 'OPEN',
      assignedOperatorId: null,
    });
    for (const c of counters) {
      expect(c.createdAt).toMatch(RFC3339_UTC);
      expect(c.updatedAt).toMatch(RFC3339_UTC);
    }
  });

  it('COUNTER-003 (AC-36): assigned operator toggles counter status OPEN <-> CLOSED (including CLOSED parent queue) and invalid payloads return 400', async () => {
    // Toggle OPEN -> CLOSED -> CLOSED (idempotent) -> OPEN on queue1.
    const closed1 = await updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'CLOSED' });
    expect(closed1.status).toBe(200);
    expect(closed1.body.data.counter).toMatchObject({ id: COUNTER_Q1_1, status: 'CLOSED' });
    expect((await counterRow(COUNTER_Q1_1))?.status).toBe('CLOSED');

    const closedRepeat = await updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'CLOSED' });
    expect(closedRepeat.status).toBe(200);
    expect(closedRepeat.body.data.counter.status).toBe('CLOSED');

    const reopened = await updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'OPEN' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.counter.status).toBe('OPEN');
    expect((await counterRow(COUNTER_Q1_1))?.status).toBe('OPEN');

    // Blocking #1 fix: explicitly assign operator1 to CLOSED queue2 in test setup before toggling queue2's counter.
    await prisma.operatorAssignment.create({
      data: { operatorId: OPERATOR1.id, serviceQueueId: CLOSED_QUEUE_ID },
    });
    const closedQueueToggle = await updateCounterStatus(operator1, COUNTER_Q2_1, { status: 'CLOSED' });
    expect(closedQueueToggle.status).toBe(200);
    expect(closedQueueToggle.body.data.counter).toMatchObject({
      id: COUNTER_Q2_1,
      serviceQueueId: CLOSED_QUEUE_ID,
      status: 'CLOSED',
    });
    expect((await counterRow(COUNTER_Q2_1))?.status).toBe('CLOSED');
    expect((await updateCounterStatus(operator1, COUNTER_Q2_1, { status: 'OPEN' })).status).toBe(200);

    // Invalid payloads rejected with 400 INVALID_ARGUMENT and no DB change.
    const before = await counterRow(COUNTER_Q1_1);
    const badPayloads: Array<Record<string, unknown>> = [
      {},
      { status: 'PAUSED' },
      { status: 123 },
      { status: 'OPEN', extra: true },
    ];
    for (const payload of badPayloads) {
      const res = await updateCounterStatus(operator1, COUNTER_Q1_1, payload);
      expect(res.status, `payload ${JSON.stringify(payload)}`).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
      expect(await counterRow(COUNTER_Q1_1)).toEqual(before);
    }
  });

  it('COUNTER-004 (AC-37): GET queue counters enforces auth, OPERATOR role, queue assignment, and UUID validation', async () => {
    const cases: Array<[string, () => request.Test, number, string]> = [
      ['anonymous', () => listCounters(null, OPEN_QUEUE_ID), 401, 'UNAUTHORIZED'],
      ['customer1', () => listCounters(customer1, OPEN_QUEUE_ID), 403, 'FORBIDDEN'],
      ['unassigned operator2', () => listCounters(operator2, OPEN_QUEUE_ID), 403, 'FORBIDDEN'],
      ['malformed queueId', () => listCounters(operator1, 'not-a-uuid'), 400, 'INVALID_ARGUMENT'],
      ['unknown valid UUIDv4 queueId', () => listCounters(operator1, UNKNOWN_V4), 404, 'RESOURCE_NOT_FOUND'],
    ];
    for (const [name, send, status, code] of cases) {
      const res = await send();
      expect(res.status, name).toBe(status);
      expect(res.body.error?.code, name).toBe(code);
    }
  });

  it('COUNTER-005 (AC-37): PATCH status and POST counter call-next enforce auth, CSRF, role, assignment, assignedOperatorId, and UUID validation', async () => {
    const waiting = await joined(customer1);
    const operator3 = await makeOperator('operator3@example.test', OPEN_QUEUE_ID);

    // Scope C2 to operator3 so operator1 (assigned to queue1) is rejected on C2 with 403 FORBIDDEN.
    await prisma.$executeRaw`
      UPDATE "Counter" SET "assignedOperatorId" = ${operator3.id}::uuid WHERE "id" = ${COUNTER_Q1_2}::uuid`;

    const c1Before = await counterRow(COUNTER_Q1_1);
    const c2Before = await counterRow(COUNTER_Q1_2);
    const entryBefore = await entryRow(waiting.id);

    const statusCases: Array<[string, () => request.Test, number, string]> = [
      ['PATCH anonymous', () => updateCounterStatus(null, COUNTER_Q1_1, { status: 'CLOSED' }, null), 401, 'UNAUTHORIZED'],
      ['PATCH customer1', () => updateCounterStatus(customer1, COUNTER_Q1_1, { status: 'CLOSED' }), 403, 'FORBIDDEN'],
      ['PATCH unassigned operator2', () => updateCounterStatus(operator2, COUNTER_Q1_1, { status: 'CLOSED' }), 403, 'FORBIDDEN'],
      ['PATCH operator1 on operator3-owned C2', () => updateCounterStatus(operator1, COUNTER_Q1_2, { status: 'CLOSED' }), 403, 'FORBIDDEN'],
      ['PATCH missing CSRF', () => updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'CLOSED' }, null), 403, 'FORBIDDEN'],
      ['PATCH wrong CSRF', () => updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'CLOSED' }, 'wrong-csrf'), 403, 'FORBIDDEN'],
      ['PATCH malformed counterId', () => updateCounterStatus(operator1, 'not-a-uuid', { status: 'CLOSED' }), 400, 'INVALID_ARGUMENT'],
      ['PATCH unknown counterId', () => updateCounterStatus(operator1, UNKNOWN_V4, { status: 'CLOSED' }), 404, 'RESOURCE_NOT_FOUND'],
    ];

    const callNextCases: Array<[string, () => request.Test, number, string]> = [
      ['POST anonymous', () => counterCallNext(null, COUNTER_Q1_1, null), 401, 'UNAUTHORIZED'],
      ['POST customer1', () => counterCallNext(customer1, COUNTER_Q1_1), 403, 'FORBIDDEN'],
      ['POST unassigned operator2', () => counterCallNext(operator2, COUNTER_Q1_1), 403, 'FORBIDDEN'],
      ['POST operator1 on operator3-owned C2', () => counterCallNext(operator1, COUNTER_Q1_2), 403, 'FORBIDDEN'],
      ['POST missing CSRF', () => counterCallNext(operator1, COUNTER_Q1_1, null), 403, 'FORBIDDEN'],
      ['POST wrong CSRF', () => counterCallNext(operator1, COUNTER_Q1_1, 'wrong-csrf'), 403, 'FORBIDDEN'],
      ['POST malformed counterId', () => counterCallNext(operator1, 'not-a-uuid'), 400, 'INVALID_ARGUMENT'],
      ['POST unknown counterId', () => counterCallNext(operator1, UNKNOWN_V4), 404, 'RESOURCE_NOT_FOUND'],
    ];

    for (const [name, send, status, code] of [...statusCases, ...callNextCases]) {
      const res = await send();
      expect(res.status, name).toBe(status);
      expect(res.body.error?.code, name).toBe(code);
      expect(await counterRow(COUNTER_Q1_1), `${name}: C1 unchanged`).toEqual(c1Before);
      expect(await counterRow(COUNTER_Q1_2), `${name}: C2 unchanged`).toEqual(c2Before);
      expect(await entryRow(waiting.id), `${name}: entry unchanged`).toEqual(entryBefore);
    }

    // Matching operator3 CAN operate C2.
    const allowed = await counterCallNext(operator3.session, COUNTER_Q1_2);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.entry).toMatchObject({
      id: waiting.id,
      status: 'CALLED',
      counterId: COUNTER_Q1_2,
      counterName: 'Counter 2',
    });
  });

  it('COUNTER-006 (AC-38): counter-scoped Call Next claims FIFO entries and exposes counterId/counterName across operator and customer reads', async () => {
    const a = await joined(customer1);
    const b = await joined(customer2);

    const call1 = await counterCallNext(operator1, COUNTER_Q1_1);
    expect(call1.status).toBe(200);
    expect(call1.body.data.entry).toMatchObject({
      id: a.id,
      status: 'CALLED',
      counterId: COUNTER_Q1_1,
      counterName: 'Counter 1',
    });
    expect(call1.body.data.entry.calledAt).toMatch(RFC3339_UTC);

    const call2 = await counterCallNext(operator1, COUNTER_Q1_2);
    expect(call2.status).toBe(200);
    expect(call2.body.data.entry).toMatchObject({
      id: b.id,
      status: 'CALLED',
      counterId: COUNTER_Q1_2,
      counterName: 'Counter 2',
    });

    expect((await entryRow(a.id))?.counterId).toBe(COUNTER_Q1_1);
    expect((await entryRow(b.id))?.counterId).toBe(COUNTER_Q1_2);

    const opList = await get(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
    expect(opList.status).toBe(200);
    expect(opList.body.data.entries[0]).toMatchObject({ id: a.id, counterId: COUNTER_Q1_1, counterName: 'Counter 1' });
    expect(opList.body.data.entries[1]).toMatchObject({ id: b.id, counterId: COUNTER_Q1_2, counterName: 'Counter 2' });

    const c1List = await get(customer1, '/api/me/queue-entries');
    expect(c1List.status).toBe(200);
    expect(c1List.body.data.entries[0]).toMatchObject({ id: a.id, counterId: COUNTER_Q1_1, counterName: 'Counter 1' });

    const c1Detail = await get(customer1, `/api/me/queue-entries/${a.id}`);
    expect(c1Detail.status).toBe(200);
    expect(c1Detail.body.data.entry).toMatchObject({ id: a.id, counterId: COUNTER_Q1_1, counterName: 'Counter 1' });
  });

  it('COUNTER-007 (AC-39): closed counter rejects Call Next with 409 COUNTER_CLOSED while in-flight entries at that counter can still start, complete, or mark no-show', async () => {
    const a = await joined(customer1);
    const b = await joined(customer2);

    expect((await counterCallNext(operator1, COUNTER_Q1_1)).status).toBe(200);
    expect((await updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'CLOSED' })).status).toBe(200);

    const bBefore = await entryRow(b.id);
    const rejected = await counterCallNext(operator1, COUNTER_Q1_1);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('COUNTER_CLOSED');
    expect(await entryRow(b.id)).toEqual(bBefore);

    // Entry A already CALLED at closed C1 can still Start and Complete preserving counterId/counterName.
    const started = await start(operator1, a.id);
    expect(started.status).toBe(200);
    expect(started.body.data.entry).toMatchObject({ status: 'SERVING', counterId: COUNTER_Q1_1, counterName: 'Counter 1' });

    const completed = await complete(operator1, a.id);
    expect(completed.status).toBe(200);
    expect(completed.body.data.entry).toMatchObject({ status: 'COMPLETED', counterId: COUNTER_Q1_1, counterName: 'Counter 1' });

    // Sub-case: CALLED entry at closed C1 can also be marked NO_SHOW preserving counterId/counterName.
    expect((await updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'OPEN' })).status).toBe(200);
    expect((await counterCallNext(operator1, COUNTER_Q1_1)).status).toBe(200);
    expect((await updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'CLOSED' })).status).toBe(200);
    const missed = await noShow(operator1, b.id);
    expect(missed.status).toBe(200);
    expect(missed.body.data.entry).toMatchObject({ status: 'NO_SHOW', counterId: COUNTER_Q1_1, counterName: 'Counter 1' });
  });

  it('COUNTER-008 (AC-38, AC-39): empty queue returns 409 NO_WAITING_ENTRIES; CLOSED parent queue still allows counter Call Next', async () => {
    const empty = await counterCallNext(operator1, COUNTER_Q1_1);
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe('NO_WAITING_ENTRIES');

    const a = await joined(customer1);
    await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { availability: 'CLOSED' } });
    const called = await counterCallNext(operator1, COUNTER_Q1_1);
    expect(called.status).toBe(200);
    expect(called.body.data.entry).toMatchObject({
      id: a.id,
      status: 'CALLED',
      counterId: COUNTER_Q1_1,
      counterName: 'Counter 1',
    });
  });

  it('COUNTER-009 (AC-39): legacy queue-level Call Next remains backward compatible, sets counterId = NULL, and returns 204 when empty', async () => {
    const a = await joined(customer1);
    // Drive A through counter Call Next -> NO_SHOW -> recover, then call via legacy endpoint.
    expect((await counterCallNext(operator1, COUNTER_Q1_1)).status).toBe(200);
    expect((await noShow(operator1, a.id)).status).toBe(200);
    expect((await recover(operator1, a.id)).status).toBe(200);

    const legacy = await legacyCallNext(operator1, OPEN_QUEUE_ID);
    expect(legacy.status).toBe(200);
    expect(legacy.body.data.entry).toMatchObject({
      id: a.id,
      status: 'CALLED',
      counterId: null,
      counterName: null,
    });
    expect((await entryRow(a.id))?.counterId).toBeNull();

    const empty = await legacyCallNext(operator1, OPEN_QUEUE_ID);
    expect(empty.status).toBe(204);
    expect(empty.text).toBe('');
  });

  it('COUNTER-010 (AC-40): parallel multi-counter Call Next across C1 and C2 (15 rounds each): zero double-claims and zero lost updates', async () => {
    // Part (a): 2 waiting entries {A, B} -> both 200 claiming distinct entries.
    for (let round = 0; round < 15; round += 1) {
      await prisma.queueEntry.deleteMany({});
      const a = await joined(customer1);
      const b = await joined(customer2);

      const [r1, r2] = await Promise.all([
        counterCallNext(operator1, COUNTER_Q1_1),
        counterCallNext(operator1, COUNTER_Q1_2),
      ]);

      expect([r1.status, r2.status], `round ${round} (2 entries)`).toEqual([200, 200]);
      const id1 = r1.body.data.entry.id as string;
      const id2 = r2.body.data.entry.id as string;
      expect(id1, `round ${round}: distinct claims`).not.toBe(id2);
      expect(new Set([id1, id2])).toEqual(new Set([a.id, b.id]));
      expect(r1.body.data.entry.counterId).toBe(COUNTER_Q1_1);
      expect(r2.body.data.entry.counterId).toBe(COUNTER_Q1_2);
      expect((await entryRow(id1))?.counterId).toBe(COUNTER_Q1_1);
      expect((await entryRow(id2))?.counterId).toBe(COUNTER_Q1_2);
    }

    // Part (b): 1 waiting entry A -> exactly one 200 and one 409 NO_WAITING_ENTRIES.
    for (let round = 0; round < 15; round += 1) {
      await prisma.queueEntry.deleteMany({});
      const a = await joined(customer1);

      const [r1, r2] = await Promise.all([
        counterCallNext(operator1, COUNTER_Q1_1),
        counterCallNext(operator1, COUNTER_Q1_2),
      ]);

      expect([r1.status, r2.status].sort(), `round ${round} (1 entry)`).toEqual([200, 409]);
      const winner = r1.status === 200 ? r1 : r2;
      const loser = r1.status === 409 ? r1 : r2;
      const winningCounterId = r1.status === 200 ? COUNTER_Q1_1 : COUNTER_Q1_2;

      expect(loser.body.error.code).toBe('NO_WAITING_ENTRIES');
      expect(winner.body.data.entry).toMatchObject({ id: a.id, status: 'CALLED', counterId: winningCounterId });
      expect((await entryRow(a.id))?.counterId).toBe(winningCounterId);
    }
  });

  it('COUNTER-011 (AC-40): parallel Call Next vs Close Counter on the same counter (15 rounds): serializes cleanly with zero deadlocks', async () => {
    for (let round = 0; round < 15; round += 1) {
      await prisma.queueEntry.deleteMany({});
      await prisma.$executeRaw`UPDATE "Counter" SET "status" = 'OPEN'::"CounterStatus" WHERE "id" = ${COUNTER_Q1_1}::uuid`;
      const a = await joined(customer1);

      const [callRes, closeRes] = await Promise.all([
        counterCallNext(operator1, COUNTER_Q1_1),
        updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'CLOSED' }),
      ]);

      expect(closeRes.status, `round ${round}: close`).toBe(200);
      expect(closeRes.body.data.counter.status).toBe('CLOSED');
      expect((await counterRow(COUNTER_Q1_1))?.status).toBe('CLOSED');

      const stored = await entryRow(a.id);
      if (callRes.status === 200) {
        expect(stored?.status).toBe('CALLED');
        expect(stored?.counterId).toBe(COUNTER_Q1_1);
      } else {
        expect(callRes.status, `round ${round}: call lost lock`).toBe(409);
        expect(callRes.body.error.code).toBe('COUNTER_CLOSED');
        expect(stored?.status).toBe('WAITING');
        expect(stored?.counterId).toBeNull();
      }
    }
  });

  it('COUNTER-012 (AC-41): F-08 recovery clears counterId and F-07 CANCELLED / NO_SHOW entries are skipped by counter Call Next', async () => {
    const a = await joined(customer1);
    const b = await joined(customer2);

    expect((await counterCallNext(operator1, COUNTER_Q1_1)).status).toBe(200);
    const missed = await noShow(operator1, a.id);
    expect(missed.status).toBe(200);
    expect(missed.body.data.entry).toMatchObject({ status: 'NO_SHOW', counterId: COUNTER_Q1_1, counterName: 'Counter 1' });

    const recovered = await recover(operator1, a.id);
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.entry).toMatchObject({
      id: a.id,
      status: 'WAITING',
      calledAt: null,
      counterId: null,
      counterName: null,
    });
    expect((await entryRow(a.id))?.counterId).toBeNull();

    expect((await cancel(customer2, b.id)).status).toBe(200);
    expect((await entryRow(b.id))?.counterId).toBeNull();

    // Call Next at C2 claims recovered A (not cancelled B) and assigns C2.
    const recalled = await counterCallNext(operator1, COUNTER_Q1_2);
    expect(recalled.status).toBe(200);
    expect(recalled.body.data.entry).toMatchObject({
      id: a.id,
      status: 'CALLED',
      counterId: COUNTER_Q1_2,
      counterName: 'Counter 2',
    });

    // No remaining WAITING entries (B is CANCELLED).
    const empty = await counterCallNext(operator1, COUNTER_Q1_1);
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe('NO_WAITING_ENTRIES');
    expect((await entryRow(b.id))?.status).toBe('CANCELLED');
    expect((await entryRow(b.id))?.counterId).toBeNull();
  });

  it('COUNTER-013 (AC-41, AC-44): DB enforces unique (serviceQueueId, name), composite FK (counterId, serviceQueueId), MATCH SIMPLE NULL, and idempotent seeding', async () => {
    const e = await joined(customer1, OPEN_QUEUE_ID);

    // (a) Duplicate (serviceQueueId, name) rejected with 23505.
    let dupErr: unknown;
    try {
      await prisma.$executeRaw`
        INSERT INTO "Counter" ("id", "serviceQueueId", "name", "status", "createdAt", "updatedAt")
        VALUES (${UNKNOWN_V4}::uuid, ${OPEN_QUEUE_ID}::uuid, 'Counter 1', 'OPEN'::"CounterStatus", now(), now())`;
    } catch (err) {
      dupErr = err;
    }
    expect(dupErr, 'duplicate counter name per queue must fail').toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(String((dupErr as Error).message)).toMatch(/23505|unique constraint/i);

    // (b) Unknown counterId rejected with 23503.
    let unknownFkErr: unknown;
    try {
      await prisma.$executeRaw`
        UPDATE "QueueEntry" SET "counterId" = ${UNKNOWN_V4}::uuid WHERE "id" = ${e.id}::uuid`;
    } catch (err) {
      unknownFkErr = err;
    }
    expect(unknownFkErr, 'unknown counterId must fail FK').toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(String((unknownFkErr as Error).message)).toMatch(/23503|foreign key/i);

    // (c) Composite FK rejects valid counterId belonging to a different serviceQueueId (queue2 Counter 1 on queue1 entry).
    let crossQueueFkErr: unknown;
    try {
      await prisma.$executeRaw`
        UPDATE "QueueEntry" SET "counterId" = ${COUNTER_Q2_1}::uuid WHERE "id" = ${e.id}::uuid`;
    } catch (err) {
      crossQueueFkErr = err;
    }
    expect(crossQueueFkErr, 'cross-queue counterId must fail composite FK').toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError
    );
    expect(String((crossQueueFkErr as Error).message)).toMatch(/23503|foreign key/i);

    // (d) MATCH SIMPLE allows counterId = NULL.
    await prisma.$executeRaw`
      UPDATE "QueueEntry" SET "counterId" = NULL WHERE "id" = ${e.id}::uuid`;
    expect((await entryRow(e.id))?.counterId).toBeNull();

    // (e) Idempotent re-seed keeps 4 deterministic counters and preserves toggled CLOSED status on C1.
    expect((await updateCounterStatus(operator1, COUNTER_Q1_1, { status: 'CLOSED' })).status).toBe(200);
    await seed(prisma);
    const allCounters = await prisma.$queryRaw<CounterRowSnapshot[]>`
      SELECT "id", "serviceQueueId", "name", "status"::text AS status, "assignedOperatorId", "createdAt", "updatedAt"
      FROM "Counter"
      ORDER BY "serviceQueueId" ASC, "name" ASC`;
    expect(allCounters).toHaveLength(4);
    expect(allCounters.map((c) => c.id)).toEqual([COUNTER_Q1_1, COUNTER_Q1_2, COUNTER_Q2_1, COUNTER_Q2_2]);
    expect(allCounters.find((c) => c.id === COUNTER_Q1_1)?.status).toBe('CLOSED');
  });
});
