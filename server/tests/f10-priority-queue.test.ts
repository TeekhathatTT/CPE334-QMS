/**
 * F-10 Priority queue policy: API + real PostgreSQL integration, concurrency,
 * cross-feature (F-07, F-08, F-09), and database integrity tests.
 * Canonical STS: PRIO-002 – PRIO-013 in docs/sprints/sprint-2/tests.md §9.1.
 * Contract: docs/sprints/sprint-2/api-spec.md §17–§21, docs/features/sprint-2-f10-priority-queue-policy.md v1.1.
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
  CUSTOMER2,
  OPERATOR1,
  OPERATOR2,
  OPEN_QUEUE_ID,
  CLOSED_QUEUE_ID,
  type LoggedIn,
} from './helpers/auth';

const COUNTER_Q1_1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const COUNTER_Q1_2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const UNKNOWN_V4 = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';

interface EntryRowBase {
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

interface EntryRowWithPriority extends EntryRowBase {
  priority: string;
}

async function entryRowWithPriority(id: string): Promise<EntryRowWithPriority | undefined> {
  const rows = await prisma.$queryRaw<EntryRowWithPriority[]>`
    SELECT "id", "serviceQueueId", "status"::text AS status, "priority"::text AS priority,
           "queueNumber", "joinedAt", "calledAt", "serviceStartedAt", "completedAt",
           "cancelledAt", "noShowAt", "recoveredAt", "noShowCount", "counterId"
    FROM "QueueEntry"
    WHERE "id" = ${id}::uuid`;
  return rows[0];
}

async function entryRowBase(id: string): Promise<EntryRowBase | undefined> {
  const rows = await prisma.$queryRaw<EntryRowBase[]>`
    SELECT "id", "serviceQueueId", "status"::text AS status,
           "queueNumber", "joinedAt", "calledAt", "serviceStartedAt", "completedAt",
           "cancelledAt", "noShowAt", "recoveredAt", "noShowCount", "counterId"
    FROM "QueueEntry"
    WHERE "id" = ${id}::uuid`;
  return rows[0];
}

function get(user: LoggedIn | null, path: string) {
  const req = request(app).get(path);
  if (user) req.set('Cookie', user.cookieHeader);
  return req;
}

function post(
  user: LoggedIn | null,
  path: string,
  body?: Record<string, unknown>,
  csrf: string | null | undefined = user?.csrfToken
) {
  const req = request(app).post(path);
  if (user) req.set('Cookie', user.cookieHeader);
  if (typeof csrf === 'string') req.set('X-CSRF-Token', csrf);
  return body !== undefined ? req.send(body) : req;
}

function patch(
  user: LoggedIn | null,
  path: string,
  body?: Record<string, unknown>,
  csrf: string | null | undefined = user?.csrfToken
) {
  const req = request(app).patch(path);
  if (user) req.set('Cookie', user.cookieHeader);
  if (typeof csrf === 'string') req.set('X-CSRF-Token', csrf);
  return body !== undefined ? req.send(body) : req;
}

const join = (user: LoggedIn, queueId = OPEN_QUEUE_ID, body?: Record<string, unknown>) =>
  post(user, `/api/queues/${queueId}/entries`, body);

const updatePriority = (
  user: LoggedIn | null,
  entryId: string,
  body?: Record<string, unknown>,
  csrf?: string | null
) =>
  patch(
    user,
    `/api/operator/queue-entries/${entryId}/priority`,
    body,
    csrf === undefined ? user?.csrfToken : csrf
  );

const counterCallNext = (op: LoggedIn, counterId: string) =>
  post(op, `/api/operator/counters/${counterId}/call-next`);

const legacyCallNext = (op: LoggedIn, queueId = OPEN_QUEUE_ID) =>
  post(op, `/api/operator/queues/${queueId}/call-next`);

const start = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/start`);
const complete = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/complete`);
const noShow = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/no-show`);
const recover = (op: LoggedIn, id: string) => post(op, `/api/operator/queue-entries/${id}/recover`);
const cancel = (user: LoggedIn, id: string) => post(user, `/api/me/queue-entries/${id}/cancel`);

async function joined(user: LoggedIn, queueId = OPEN_QUEUE_ID): Promise<{ id: string; queueNumber: number; priority?: string }> {
  const res = await join(user, queueId);
  expect(res.status, 'join').toBe(201);
  return res.body.data.entry;
}

async function makeCustomer(email: string): Promise<{ id: string; session: LoggedIn }> {
  const seeded = await prisma.user.findUniqueOrThrow({ where: { id: CUSTOMER1.id } });
  const created = await prisma.user.create({
    data: { email, passwordHash: seeded.passwordHash, role: 'CUSTOMER', accountStatus: 'ACTIVE' },
  });
  return { id: created.id, session: await login(app, email) };
}

/** Shared cross-feature row invariants (tests.md §9.3 plus §4, §7.3, §8.3). */
async function assertCoreInvariants(): Promise<void> {
  const badWaitingOrCancelled = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "QueueEntry"
    WHERE "status" IN ('WAITING', 'CANCELLED') AND "counterId" IS NOT NULL`;
  expect(badWaitingOrCancelled, 'WAITING/CANCELLED rows with non-null counterId').toEqual([]);

  const activeDupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "customerId", "serviceQueueId" FROM "QueueEntry"
      WHERE "status" IN ('WAITING', 'CALLED', 'SERVING')
      GROUP BY "customerId", "serviceQueueId"
      HAVING COUNT(*) > 1
    ) d`;
  expect(activeDupes[0].n, 'duplicate active entries per customer+queue').toBe(0n);

  const overCap = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "customerId" FROM "QueueEntry"
      WHERE "status" IN ('WAITING', 'CALLED', 'SERVING')
      GROUP BY "customerId"
      HAVING COUNT(*) > 2
    ) c`;
  expect(overCap[0].n, 'customers exceeding BR-06 2-active-entry cap').toBe(0n);

  const numDupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "serviceQueueId", "queueNumber" FROM "QueueEntry"
      GROUP BY "serviceQueueId", "queueNumber"
      HAVING COUNT(*) > 1
    ) d`;
  expect(numDupes[0].n, 'duplicate queue numbers').toBe(0n);
}

async function assertPriorityColumnInvariant(): Promise<void> {
  const invalidPriority = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "QueueEntry"
    WHERE "priority" IS NULL
       OR "priority"::text NOT IN ('NORMAL', 'PRIORITY')`;
  expect(invalidPriority, 'rows with NULL or invalid QueuePriority').toEqual([]);
}

describe('F-10: priority queue policy', () => {
  let customer1: LoggedIn;
  let customer2: LoggedIn;
  let operator1: LoggedIn;
  let operator2: LoggedIn;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    await resetAndSeed();
    [customer1, customer2, operator1, operator2] = await Promise.all([
      login(app, CUSTOMER1.email),
      login(app, CUSTOMER2.email),
      login(app, OPERATOR1.email),
      login(app, OPERATOR2.email),
    ]);
  });

  afterEach(async () => {
    await assertCoreInvariants();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('PRIO-002 (AC-46): join defaults to NORMAL and every QueueEntry payload includes additive priority', async () => {
    const joinRes = await join(customer1);
    expect(joinRes.status).toBe(201);
    const entry = joinRes.body.data.entry;
    expect(entry.priority).toBe('NORMAL');

    const dbRow = await entryRowWithPriority(entry.id);
    expect(dbRow?.priority).toBe('NORMAL');

    const myList = await get(customer1, '/api/me/queue-entries');
    expect(myList.status).toBe(200);
    expect(myList.body.data.entries[0].priority).toBe('NORMAL');

    const myDetail = await get(customer1, `/api/me/queue-entries/${entry.id}`);
    expect(myDetail.status).toBe(200);
    expect(myDetail.body.data.entry.priority).toBe('NORMAL');

    const opList = await get(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
    expect(opList.status).toBe(200);
    expect(opList.body.data.entries[0].priority).toBe('NORMAL');

    const called = await counterCallNext(operator1, COUNTER_Q1_1);
    expect(called.status).toBe(200);
    expect(called.body.data.entry.priority).toBe('NORMAL');

    const started = await start(operator1, entry.id);
    expect(started.status).toBe(200);
    expect(started.body.data.entry.priority).toBe('NORMAL');

    const completed = await complete(operator1, entry.id);
    expect(completed.status).toBe(200);
    expect(completed.body.data.entry.priority).toBe('NORMAL');

    await assertPriorityColumnInvariant();
  });

  it('PRIO-003 (AC-47): counter and legacy Call Next serve PRIORITY before NORMAL with FIFO tie-breaking and preserve pure FIFO for all-NORMAL', async () => {
    const c3 = await makeCustomer('prio3-c3@example.com');
    const c4 = await makeCustomer('prio3-c4@example.com');

    const runOrderCheck = async (mode: 'counter' | 'legacy') => {
      await prisma.queueEntry.deleteMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });
      await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { lastQueueNumber: 0n } });

      const t0 = new Date('2026-11-28T09:00:00.000Z');
      const t1 = new Date('2026-11-28T09:01:00.000Z');
      const t2 = new Date('2026-11-28T09:02:00.000Z');

      const n1Id = '11111111-aaaa-4111-8111-111111111101';
      const n2Id = '22222222-aaaa-4222-8222-222222222202';
      const p1Id = '33333333-aaaa-4333-8333-333333333303';
      const p2Id = '44444444-aaaa-4444-8444-444444444404';

      await prisma.queueEntry.createMany({
        data: [
          { id: n1Id, customerId: CUSTOMER1.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: 1n, status: 'WAITING', joinedAt: t0 },
          { id: n2Id, customerId: CUSTOMER2.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: 2n, status: 'WAITING', joinedAt: t1 },
          { id: p2Id, customerId: c4.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: 4n, status: 'WAITING', joinedAt: t2 },
          { id: p1Id, customerId: c3.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: 3n, status: 'WAITING', joinedAt: t2 },
        ],
      });

      expect((await updatePriority(operator1, p1Id, { priority: 'PRIORITY' })).status).toBe(200);
      expect((await updatePriority(operator1, p2Id, { priority: 'PRIORITY' })).status).toBe(200);

      const claimedIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        const res =
          mode === 'counter'
            ? await counterCallNext(operator1, i % 2 === 0 ? COUNTER_Q1_1 : COUNTER_Q1_2)
            : await legacyCallNext(operator1, OPEN_QUEUE_ID);
        expect(res.status).toBe(200);
        claimedIds.push(res.body.data.entry.id);
      }
      expect(claimedIds).toEqual([p1Id, p2Id, n1Id, n2Id]);
    };

    await runOrderCheck('counter');
    await runOrderCheck('legacy');

    // All-NORMAL sub-case: pure Sprint 1 FIFO parity.
    await prisma.queueEntry.deleteMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });
    await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { lastQueueNumber: 0n } });
    const a = await joined(customer1);
    const b = await joined(customer2);
    const first = await counterCallNext(operator1, COUNTER_Q1_1);
    const second = await counterCallNext(operator1, COUNTER_Q1_2);
    expect(first.body.data.entry.id).toBe(a.id);
    expect(second.body.data.entry.id).toBe(b.id);
  });

  it('PRIO-004 (AC-47): GET operator entries applies priority rank ONLY to WAITING entries and aheadCount reflects priority order', async () => {
    const c3 = await makeCustomer('prio4-c3@example.com');
    const c4 = await makeCustomer('prio4-c4@example.com');
    const c5 = await makeCustomer('prio4-c5@example.com');
    const c6 = await makeCustomer('prio4-c6@example.com');

    const t0 = new Date('2026-11-28T08:00:00.000Z');
    const t1 = new Date('2026-11-28T08:05:00.000Z');
    const t2 = new Date('2026-11-28T09:00:00.000Z');
    const t3 = new Date('2026-11-28T09:01:00.000Z');
    const t4 = new Date('2026-11-28T09:02:00.000Z');
    const t5 = new Date('2026-11-28T09:03:00.000Z');

    // Two COMPLETED entries: earlier NORMAL (t0) and later PRIORITY (t1).
    // Nit 2: non-WAITING entries MUST remain in strict chronological order (earlier NORMAL before later PRIORITY).
    const compNormalId = '11111111-bbbb-4111-8111-111111111110';
    const compPrioId = '22222222-bbbb-4222-8222-222222222211';

    // Four WAITING entries: N1 (t2), N2 (t3), P1 (t4), P2 (t5).
    const n1Id = '33333333-bbbb-4333-8333-333333333312';
    const n2Id = '44444444-bbbb-4444-8444-444444444413';
    const p1Id = '55555555-bbbb-4555-8555-555555555514';
    const p2Id = '66666666-bbbb-4666-8666-666666666615';

    await prisma.queueEntry.createMany({
      data: [
        {
          id: compNormalId,
          customerId: c5.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 1n,
          status: 'COMPLETED',
          joinedAt: t0,
          calledAt: t0,
          serviceStartedAt: t0,
          completedAt: t0,
        },
        {
          id: compPrioId,
          customerId: c6.id,
          serviceQueueId: OPEN_QUEUE_ID,
          queueNumber: 2n,
          status: 'WAITING',
          joinedAt: t1,
        },
        { id: n1Id, customerId: CUSTOMER1.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: 3n, status: 'WAITING', joinedAt: t2 },
        { id: n2Id, customerId: CUSTOMER2.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: 4n, status: 'WAITING', joinedAt: t3 },
        { id: p1Id, customerId: c3.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: 5n, status: 'WAITING', joinedAt: t4 },
        { id: p2Id, customerId: c4.id, serviceQueueId: OPEN_QUEUE_ID, queueNumber: 6n, status: 'WAITING', joinedAt: t5 },
      ],
    });

    // Promote compPrioId while WAITING, then complete it so we have a COMPLETED PRIORITY row at t1 > t0.
    expect((await updatePriority(operator1, compPrioId, { priority: 'PRIORITY' })).status).toBe(200);
    expect((await counterCallNext(operator1, COUNTER_Q1_1)).body.data.entry.id).toBe(compPrioId);
    expect((await start(operator1, compPrioId)).status).toBe(200);
    expect((await complete(operator1, compPrioId)).status).toBe(200);

    // Before promoting P1/P2: N1 is at aheadCount 0.
    const n1Before = await get(customer1, `/api/me/queue-entries/${n1Id}`);
    expect(n1Before.body.data.entry.aheadCount).toBe(0);

    // Promote P1 and P2 to PRIORITY.
    expect((await updatePriority(operator1, p1Id, { priority: 'PRIORITY' })).status).toBe(200);
    expect((await updatePriority(operator1, p2Id, { priority: 'PRIORITY' })).status).toBe(200);

    const opList = await get(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
    expect(opList.status).toBe(200);
    const entries = opList.body.data.entries as Array<{ id: string; status: string; priority: string }>;

    const waitingIds = entries.filter((e) => e.status === 'WAITING').map((e) => e.id);
    expect(waitingIds).toEqual([p1Id, p2Id, n1Id, n2Id]);

    const completedIds = entries.filter((e) => e.status === 'COMPLETED').map((e) => e.id);
    expect(completedIds).toEqual([compNormalId, compPrioId]);

    // aheadCount matches priority-aware order (and N1 increased non-monotonically from 0 to 2).
    const [dP1, dP2, dN1, dN2] = await Promise.all([
      get(c3.session, `/api/me/queue-entries/${p1Id}`),
      get(c4.session, `/api/me/queue-entries/${p2Id}`),
      get(customer1, `/api/me/queue-entries/${n1Id}`),
      get(customer2, `/api/me/queue-entries/${n2Id}`),
    ]);
    expect(dP1.body.data.entry.aheadCount).toBe(0);
    expect(dP2.body.data.entry.aheadCount).toBe(1);
    expect(dN1.body.data.entry.aheadCount).toBe(2);
    expect(dN2.body.data.entry.aheadCount).toBe(3);

    // Demoting P1 back to NORMAL recalculates aheadCount immediately.
    expect((await updatePriority(operator1, p1Id, { priority: 'NORMAL' })).status).toBe(200);
    const dN1After = await get(customer1, `/api/me/queue-entries/${n1Id}`);
    const dP1After = await get(c3.session, `/api/me/queue-entries/${p1Id}`);
    expect(dN1After.body.data.entry.aheadCount).toBe(1); // only P2 ahead
    expect(dP1After.body.data.entry.aheadCount).toBe(3); // P2, N1, N2 ahead
  });

  it('PRIO-005 (AC-48): assigned operator updates WAITING entry priority idempotently, preserves joinedAt/queueNumber, and works on CLOSED queue', async () => {
    const e = await joined(customer1);
    const before = await entryRowBase(e.id);

    const toPrio = await updatePriority(operator1, e.id, { priority: 'PRIORITY' });
    expect(toPrio.status).toBe(200);
    expect(toPrio.body.data.entry.priority).toBe('PRIORITY');
    expect(toPrio.body.data.entry.status).toBe('WAITING');
    expect(toPrio.body.data.entry.queueNumber).toBe(e.queueNumber);

    const afterPrio = await entryRowWithPriority(e.id);
    expect(afterPrio?.priority).toBe('PRIORITY');
    expect(afterPrio?.joinedAt.toISOString()).toBe(before?.joinedAt.toISOString());
    expect(afterPrio?.queueNumber).toBe(before?.queueNumber);

    // Repeat same value is idempotent 200.
    const repeat = await updatePriority(operator1, e.id, { priority: 'PRIORITY' });
    expect(repeat.status).toBe(200);
    expect(repeat.body.data.entry.priority).toBe('PRIORITY');

    // Back to NORMAL.
    const toNormal = await updatePriority(operator1, e.id, { priority: 'NORMAL' });
    expect(toNormal.status).toBe(200);
    expect((await entryRowWithPriority(e.id))?.priority).toBe('NORMAL');

    // CLOSED parent queue sub-case (AD-05).
    await prisma.operatorAssignment.create({
      data: { operatorId: OPERATOR1.id, serviceQueueId: CLOSED_QUEUE_ID },
    });
    const closedEntry = await prisma.queueEntry.create({
      data: {
        customerId: CUSTOMER2.id,
        serviceQueueId: CLOSED_QUEUE_ID,
        queueNumber: 1n,
        status: 'WAITING',
      },
    });
    const closedRes = await updatePriority(operator1, closedEntry.id, { priority: 'PRIORITY' });
    expect(closedRes.status).toBe(200);
    expect(closedRes.body.data.entry.priority).toBe('PRIORITY');
    expect((await entryRowWithPriority(closedEntry.id))?.priority).toBe('PRIORITY');
  });

  it('PRIO-006 (AC-49): rejects priority update on non-WAITING entries (CALLED, SERVING, COMPLETED, CANCELLED, NO_SHOW) with 409 INVALID_STATE_TRANSITION', async () => {
    const eCalled = await joined(customer1);
    expect((await counterCallNext(operator1, COUNTER_Q1_1)).status).toBe(200);

    const beforeCalled = await entryRowBase(eCalled.id);
    const resCalled = await updatePriority(operator1, eCalled.id, { priority: 'PRIORITY' });
    expect(resCalled.status).toBe(409);
    expect(resCalled.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await entryRowBase(eCalled.id)).toEqual(beforeCalled);

    // SERVING
    expect((await start(operator1, eCalled.id)).status).toBe(200);
    const beforeServing = await entryRowBase(eCalled.id);
    const resServing = await updatePriority(operator1, eCalled.id, { priority: 'PRIORITY' });
    expect(resServing.status).toBe(409);
    expect(resServing.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await entryRowBase(eCalled.id)).toEqual(beforeServing);

    // COMPLETED
    expect((await complete(operator1, eCalled.id)).status).toBe(200);
    const beforeCompleted = await entryRowBase(eCalled.id);
    const resCompleted = await updatePriority(operator1, eCalled.id, { priority: 'PRIORITY' });
    expect(resCompleted.status).toBe(409);
    expect(resCompleted.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await entryRowBase(eCalled.id)).toEqual(beforeCompleted);

    // CANCELLED
    const eCancelled = await joined(customer1);
    expect((await cancel(customer1, eCancelled.id)).status).toBe(200);
    const beforeCancelled = await entryRowBase(eCancelled.id);
    const resCancelled = await updatePriority(operator1, eCancelled.id, { priority: 'PRIORITY' });
    expect(resCancelled.status).toBe(409);
    expect(resCancelled.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await entryRowBase(eCancelled.id)).toEqual(beforeCancelled);

    // NO_SHOW
    const eNoShow = await joined(customer2);
    expect((await counterCallNext(operator1, COUNTER_Q1_2)).status).toBe(200);
    expect((await noShow(operator1, eNoShow.id)).status).toBe(200);
    const beforeNoShow = await entryRowBase(eNoShow.id);
    const resNoShow = await updatePriority(operator1, eNoShow.id, { priority: 'PRIORITY' });
    expect(resNoShow.status).toBe(409);
    expect(resNoShow.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await entryRowBase(eNoShow.id)).toEqual(beforeNoShow);
  });

  it('PRIO-007 (AC-49, AC-50): rejects malformed bodies/UUID with 400 INVALID_ARGUMENT and unknown UUID with 404 RESOURCE_NOT_FOUND', async () => {
    const e = await joined(customer1);
    const before = await entryRowBase(e.id);

    const invalidBodies: Array<Record<string, unknown> | undefined> = [
      undefined,
      {},
      { priority: 'HIGH' },
      { priority: '' },
      { priority: 123 },
      { priority: null },
      { priority: 'PRIORITY', extra: true },
    ];

    for (const body of invalidBodies) {
      const res = await updatePriority(operator1, e.id, body);
      expect(res.status, `body=${JSON.stringify(body)}`).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
    }

    const badUuid = await updatePriority(operator1, 'not-a-uuid', { priority: 'PRIORITY' });
    expect(badUuid.status).toBe(400);
    expect(badUuid.body.error.code).toBe('INVALID_ARGUMENT');

    const unknown = await updatePriority(operator1, UNKNOWN_V4, { priority: 'PRIORITY' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('RESOURCE_NOT_FOUND');

    expect(await entryRowBase(e.id)).toEqual(before);
  });

  it('PRIO-008 (AC-50): enforces auth, CSRF, OPERATOR role, and queue assignment on PATCH .../priority', async () => {
    const e = await joined(customer1);
    const before = await entryRowBase(e.id);

    const anon = await updatePriority(null, e.id, { priority: 'PRIORITY' }, null);
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHORIZED');

    const asOwner = await updatePriority(customer1, e.id, { priority: 'PRIORITY' });
    expect(asOwner.status).toBe(403);
    expect(asOwner.body.error.code).toBe('FORBIDDEN');

    const asOtherCustomer = await updatePriority(customer2, e.id, { priority: 'PRIORITY' });
    expect(asOtherCustomer.status).toBe(403);
    expect(asOtherCustomer.body.error.code).toBe('FORBIDDEN');

    const asUnassignedOp = await updatePriority(operator2, e.id, { priority: 'PRIORITY' });
    expect(asUnassignedOp.status).toBe(403);
    expect(asUnassignedOp.body.error.code).toBe('FORBIDDEN');

    const noCsrf = await updatePriority(operator1, e.id, { priority: 'PRIORITY' }, null);
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('FORBIDDEN');

    const wrongCsrf = await updatePriority(operator1, e.id, { priority: 'PRIORITY' }, 'wrong-csrf-token');
    expect(wrongCsrf.status).toBe(403);
    expect(wrongCsrf.body.error.code).toBe('FORBIDDEN');

    expect(await entryRowBase(e.id)).toEqual(before);
    expect((await entryRowWithPriority(e.id))?.priority).toBe('NORMAL');
  });

  it('PRIO-009 (AC-46, AC-50): customer join rejects self-elevation (403) and malformed priority (400) BEFORE DB lookups, and allows literal NORMAL', async () => {
    const targets = [OPEN_QUEUE_ID, CLOSED_QUEUE_ID, UNKNOWN_V4];

    for (const target of targets) {
      const selfElevate = await join(customer1, target, { priority: 'PRIORITY' });
      expect(selfElevate.status, `self-elevation on ${target}`).toBe(403);
      expect(selfElevate.body.error.code).toBe('FORBIDDEN');

      for (const bad of [{ priority: 'HIGH' }, { priority: null }, { priority: 123 }, { priority: '' }]) {
        const invalid = await join(customer1, target, bad);
        expect(invalid.status, `invalid ${JSON.stringify(bad)} on ${target}`).toBe(400);
        expect(invalid.body.error.code).toBe('INVALID_ARGUMENT');
      }
    }

    // Zero rows inserted and lastQueueNumber untouched across all rejections.
    expect(await prisma.queueEntry.count()).toBe(0);
    const q1 = await prisma.serviceQueue.findUniqueOrThrow({ where: { id: OPEN_QUEUE_ID } });
    expect(q1.lastQueueNumber).toBe(0n);

    // Literal {"priority":"NORMAL"} succeeds with 201 and priority: NORMAL.
    const literalNormal = await join(customer1, OPEN_QUEUE_ID, { priority: 'NORMAL' });
    expect(literalNormal.status).toBe(201);
    expect(literalNormal.body.data.entry.priority).toBe('NORMAL');
  });

  it('PRIO-010 (AC-51): parallel multi-counter Call Next across C1 and C2 claims distinct PRIORITY entries ahead of NORMAL (15 rounds)', async () => {
    const c3 = await makeCustomer('prio10-c3@example.com');

    for (let round = 0; round < 15; round++) {
      await prisma.queueEntry.deleteMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });
      await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { lastQueueNumber: 0n } });

      const n1 = await joined(customer1);
      const p1 = await joined(customer2);
      const p2 = await joined(c3.session);
      expect((await updatePriority(operator1, p1.id, { priority: 'PRIORITY' })).status).toBe(200);
      expect((await updatePriority(operator1, p2.id, { priority: 'PRIORITY' })).status).toBe(200);

      const [r1, r2] = await Promise.all([
        counterCallNext(operator1, COUNTER_Q1_1),
        counterCallNext(operator1, COUNTER_Q1_2),
      ]);

      expect(r1.status, `round ${round} C1`).toBe(200);
      expect(r2.status, `round ${round} C2`).toBe(200);

      const claimed = new Set([r1.body.data.entry.id, r2.body.data.entry.id]);
      expect(claimed.size, `round ${round} distinct claims`).toBe(2);
      expect(claimed, `round ${round} claimed both PRIORITY entries`).toEqual(new Set([p1.id, p2.id]));
      expect(claimed.has(n1.id), `round ${round} N1 stayed waiting`).toBe(false);
      expect((await entryRowWithPriority(n1.id))?.status).toBe('WAITING');
    }
  });

  it('PRIO-011 (AC-51): parallel PATCH /priority vs Call Next (all 3 SKIP LOCKED outcomes) and vs F-07 cancel (15 rounds each)', async () => {
    // (a1) Counter-scoped Call Next vs PATCH /priority on sole WAITING entry E.
    for (let round = 0; round < 15; round++) {
      await prisma.queueEntry.deleteMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });
      await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { lastQueueNumber: 0n } });
      const e = await joined(customer1);

      const [patchRes, callRes] = await Promise.all([
        updatePriority(operator1, e.id, { priority: 'PRIORITY' }),
        counterCallNext(operator1, COUNTER_Q1_1),
      ]);

      const row = await entryRowWithPriority(e.id);
      if (patchRes.status === 200 && callRes.status === 200) {
        // Outcome (1): PATCH committed before Call Next scanned.
        expect(row?.status).toBe('CALLED');
        expect(row?.priority).toBe('PRIORITY');
      } else if (callRes.status === 200 && patchRes.status === 409) {
        // Outcome (2): Call Next committed CALLED first; PATCH rejected.
        expect(patchRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
        expect(row?.status).toBe('CALLED');
        expect(row?.priority).toBe('NORMAL');
      } else if (patchRes.status === 200 && callRes.status === 409) {
        // Outcome (3): PATCH held FOR UPDATE lock while Call Next ran FOR UPDATE SKIP LOCKED.
        expect(callRes.body.error.code).toBe('NO_WAITING_ENTRIES');
        expect(row?.status).toBe('WAITING');
        expect(row?.priority).toBe('PRIORITY');
      } else {
        throw new Error(
          `Unexpected counter race outcome round ${round}: patch=${patchRes.status}, call=${callRes.status}`
        );
      }
    }

    // (a2) Legacy Call Next vs PATCH /priority on sole WAITING entry E (allows 204 for outcome 3).
    for (let round = 0; round < 5; round++) {
      await prisma.queueEntry.deleteMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });
      await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { lastQueueNumber: 0n } });
      const e = await joined(customer1);

      const [patchRes, callRes] = await Promise.all([
        updatePriority(operator1, e.id, { priority: 'PRIORITY' }),
        legacyCallNext(operator1, OPEN_QUEUE_ID),
      ]);

      const row = await entryRowWithPriority(e.id);
      if (patchRes.status === 200 && callRes.status === 200) {
        expect(row?.status).toBe('CALLED');
        expect(row?.priority).toBe('PRIORITY');
      } else if (callRes.status === 200 && patchRes.status === 409) {
        expect(patchRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
        expect(row?.status).toBe('CALLED');
        expect(row?.priority).toBe('NORMAL');
      } else if (patchRes.status === 200 && callRes.status === 204) {
        expect(row?.status).toBe('WAITING');
        expect(row?.priority).toBe('PRIORITY');
      } else {
        throw new Error(
          `Unexpected legacy race outcome round ${round}: patch=${patchRes.status}, call=${callRes.status}`
        );
      }
    }

    // (b) PATCH /priority vs F-07 customer cancel on same WAITING entry E.
    for (let round = 0; round < 15; round++) {
      await prisma.queueEntry.deleteMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });
      await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { lastQueueNumber: 0n } });
      const e = await joined(customer1);

      const [patchRes, cancelRes] = await Promise.all([
        updatePriority(operator1, e.id, { priority: 'PRIORITY' }),
        cancel(customer1, e.id),
      ]);

      expect(cancelRes.status, `cancel round ${round}`).toBe(200);
      const row = await entryRowWithPriority(e.id);
      expect(row?.status).toBe('CANCELLED');

      if (patchRes.status === 200) {
        expect(row?.priority).toBe('PRIORITY');
      } else {
        expect(patchRes.status).toBe(409);
        expect(patchRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
        expect(row?.priority).toBe('NORMAL');
      }
    }
  });

  it('PRIO-012 (AC-52): F-08 recovery preserves PRIORITY and NORMAL; F-07 cancel retains PRIORITY in history and skips Call Next', async () => {
    const c3 = await makeCustomer('prio12-c3@example.com');

    // (a) N1 joins before P1; P1 promoted -> called at C1 -> NO_SHOW -> recovered -> called at C2 ahead of N1.
    const n1 = await joined(customer1);
    const p1 = await joined(customer2);
    expect((await updatePriority(operator1, p1.id, { priority: 'PRIORITY' })).status).toBe(200);

    const firstCall = await counterCallNext(operator1, COUNTER_Q1_1);
    expect(firstCall.status).toBe(200);
    expect(firstCall.body.data.entry.id).toBe(p1.id);
    expect(firstCall.body.data.entry.priority).toBe('PRIORITY');

    const ns = await noShow(operator1, p1.id);
    expect(ns.status).toBe(200);
    expect(ns.body.data.entry.priority).toBe('PRIORITY');

    const rec = await recover(operator1, p1.id);
    expect(rec.status).toBe(200);
    expect(rec.body.data.entry.status).toBe('WAITING');
    expect(rec.body.data.entry.priority).toBe('PRIORITY');
    expect(rec.body.data.entry.calledAt).toBeNull();
    expect(rec.body.data.entry.counterId).toBeNull();

    // (c) Customer cancels a PRIORITY WAITING entry P2: retained for history, skipped by Call Next, excluded from aheadCount.
    const p2 = await joined(c3.session);
    expect((await updatePriority(operator1, p2.id, { priority: 'PRIORITY' })).status).toBe(200);
    const cancelledP2 = await cancel(c3.session, p2.id);
    expect(cancelledP2.status).toBe(200);
    expect(cancelledP2.body.data.entry.status).toBe('CANCELLED');
    expect(cancelledP2.body.data.entry.priority).toBe('PRIORITY');
    expect((await entryRowWithPriority(p2.id))?.priority).toBe('PRIORITY');

    // N1's aheadCount counts only recovered P1 (not cancelled P2).
    const n1Detail = await get(customer1, `/api/me/queue-entries/${n1.id}`);
    expect(n1Detail.body.data.entry.aheadCount).toBe(1);

    // Next Call Next at C2 claims recovered P1 ahead of N1 (and skips cancelled P2).
    const recallP1 = await counterCallNext(operator1, COUNTER_Q1_2);
    expect(recallP1.status).toBe(200);
    expect(recallP1.body.data.entry.id).toBe(p1.id);
    expect(recallP1.body.data.entry.priority).toBe('PRIORITY');

    // (b) Recovering a NORMAL NO_SHOW entry preserves NORMAL.
    const callN1 = await counterCallNext(operator1, COUNTER_Q1_1);
    expect(callN1.body.data.entry.id).toBe(n1.id);
    expect((await noShow(operator1, n1.id)).status).toBe(200);
    const recN1 = await recover(operator1, n1.id);
    expect(recN1.status).toBe(200);
    expect(recN1.body.data.entry.priority).toBe('NORMAL');
  });

  it('PRIO-013 (AC-53): PostgreSQL enforces QueuePriority enum, default NORMAL, partial expression index, and keeps existing constraints', async () => {
    const enumLabels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'QueuePriority'
      ORDER BY e.enumsortorder ASC`;
    expect(enumLabels.map((r) => r.enumlabel)).toEqual(['NORMAL', 'PRIORITY']);

    const idx = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'QueueEntry'
        AND indexname = 'QueueEntry_waiting_priority_fifo_idx'`;
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toMatch(/WAITING/i);
    expect(idx[0].indexdef).toMatch(/PRIORITY/i);

    // Invalid SQL enum value is rejected by PostgreSQL.
    const e = await joined(customer1);
    let invalidEnumErr: unknown;
    try {
      await prisma.$executeRaw`
        UPDATE "QueueEntry" SET "priority" = 'URGENT'::"QueuePriority" WHERE "id" = ${e.id}::uuid`;
    } catch (err) {
      invalidEnumErr = err;
    }
    expect(invalidEnumErr).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    // Existing indexes & constraints remain intact.
    const existingIdx = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'QueueEntry'
        AND indexname IN ('QueueEntry_active_customer_queue_uidx', 'QueueEntry_fifo_idx', 'QueueEntry_serviceQueueId_queueNumber_key')`;
    expect(existingIdx).toHaveLength(3);

    const existingConstraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('QueueEntry_noShowCount_range_check', 'QueueEntry_counterId_serviceQueueId_fkey')`;
    expect(existingConstraints).toHaveLength(2);

    await assertPriorityColumnInvariant();
  });
});
