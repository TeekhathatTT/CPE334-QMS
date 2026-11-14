/**
 * Issue #7 — Sprint 1 integration, authorization and consistency tests.
 *
 * Real HTTP (supertest) against the real Express app, real session cookies, real CSRF tokens and
 * the isolated PostgreSQL test database. No mocked Prisma. Only gaps left by the earlier suites are
 * covered here (see docs/sprints/sprint-1/evidence/issue7-coverage.md):
 *   1. Full authorization matrix: every protected endpoint x {anonymous, expired session, tampered
 *      cookie, logged-out session, customer, other customer, assigned operator, unassigned operator}
 *      with the exact status, error code, envelope and "no DB change" on every rejection.
 *   2. CSRF matrix on every mutation: missing, wrong, and another session's token.
 *   3. A cross-role business flow driven only through the API (no Prisma-inserted fixtures).
 *   4. Mixed concurrency (joins racing call-next; start/complete storms) followed by SQL invariants.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request, { Response } from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/auth/password';
import {
  resetAndSeed,
  login,
  SEED_PASSWORD,
  CUSTOMER1,
  CUSTOMER2,
  OPERATOR1,
  OPERATOR2,
  OPEN_QUEUE_ID,
  CLOSED_QUEUE_ID,
  type LoggedIn,
} from './helpers/auth';

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Asserts the standard error envelope `{error:{code,message,requestId}}` and nothing else. */
function expectError(res: Response, status: number, code: string): void {
  expect({ status: res.status, code: res.body?.error?.code }).toEqual({ status, code });
  expect(Object.keys(res.body)).toEqual(['error']);
  expect(typeof res.body.error.message).toBe('string');
  expect(res.body.error.message.length).toBeGreaterThan(0);
  expect(res.body.error.requestId).toMatch(UUID_RE);
  expect(res.body.data).toBeUndefined();
}

/**
 * Everything a rejected request must not change: all queue entries (status, number, timestamps),
 * every queue counter, and row counts. Sessions are excluded on purpose: reading an expired
 * session deletes it by design (AUTH-005).
 */
async function snapshot(): Promise<string> {
  const [entries, queues, users, assignments] = await Promise.all([
    prisma.queueEntry.findMany({ orderBy: { id: 'asc' } }),
    prisma.serviceQueue.findMany({ orderBy: { id: 'asc' }, select: { id: true, lastQueueNumber: true, availability: true } }),
    prisma.user.count(),
    prisma.operatorAssignment.count(),
  ]);
  return JSON.stringify({ entries, queues, users, assignments }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

async function lastQueueNumber(queueId: string): Promise<bigint> {
  const q = await prisma.serviceQueue.findUniqueOrThrow({ where: { id: queueId } });
  return q.lastQueueNumber;
}

/**
 * SQL-level consistency checks run after every scenario that mutates queue state.
 * The database has no CHECK constraint tying status to timestamps, so these are the only guard
 * that the application never commits an impossible lifecycle row.
 */
async function assertDbInvariants(): Promise<void> {
  const activeDupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "customerId", "serviceQueueId" FROM "QueueEntry"
      WHERE "status" <> 'COMPLETED'::"QueueStatus"
      GROUP BY "customerId", "serviceQueueId" HAVING COUNT(*) > 1
    ) d`;
  expect(Number(activeDupes[0].n), 'two active entries for one (customer, queue)').toBe(0);

  const numberDupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM (
      SELECT "serviceQueueId", "queueNumber" FROM "QueueEntry"
      GROUP BY "serviceQueueId", "queueNumber" HAVING COUNT(*) > 1
    ) d`;
  expect(Number(numberDupes[0].n), 'duplicate (serviceQueueId, queueNumber)').toBe(0);

  const badLifecycle = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status"::text AS status FROM "QueueEntry" WHERE NOT (
      ("status" = 'WAITING'   AND "calledAt" IS NULL     AND "serviceStartedAt" IS NULL     AND "completedAt" IS NULL) OR
      ("status" = 'CALLED'    AND "calledAt" IS NOT NULL AND "serviceStartedAt" IS NULL     AND "completedAt" IS NULL) OR
      ("status" = 'SERVING'   AND "calledAt" IS NOT NULL AND "serviceStartedAt" IS NOT NULL AND "completedAt" IS NULL) OR
      ("status" = 'COMPLETED' AND "calledAt" IS NOT NULL AND "serviceStartedAt" IS NOT NULL AND "completedAt" IS NOT NULL)
    )`;
  expect(badLifecycle, 'status/timestamp combination violates the lifecycle').toEqual([]);

  const badOrder = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "QueueEntry" WHERE
      ("calledAt" IS NOT NULL AND "calledAt" < "joinedAt") OR
      ("serviceStartedAt" IS NOT NULL AND "serviceStartedAt" < "calledAt") OR
      ("completedAt" IS NOT NULL AND "completedAt" < "serviceStartedAt")`;
  expect(badOrder, 'lifecycle timestamps out of order').toEqual([]);

  const counterBehind = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT q."id" FROM "ServiceQueue" q
    JOIN "QueueEntry" e ON e."serviceQueueId" = q."id"
    GROUP BY q."id", q."lastQueueNumber"
    HAVING MAX(e."queueNumber") > q."lastQueueNumber"`;
  expect(counterBehind, 'lastQueueNumber behind an allocated queue number').toEqual([]);
}

type Actor = {
  name: string;
  cookie?: string;
  csrf?: string;
};

function send(method: 'get' | 'post', path: string, actor: Actor) {
  let req = request(app)[method](path);
  if (actor.cookie) req = req.set('Cookie', actor.cookie);
  if (method === 'post' && actor.csrf) req = req.set('X-CSRF-Token', actor.csrf);
  return req;
}

function asActor(name: string, session: LoggedIn): Actor {
  return { name, cookie: session.cookieHeader, csrf: session.csrfToken };
}

async function apiJoin(customer: LoggedIn, queueId = OPEN_QUEUE_ID): Promise<Response> {
  return request(app)
    .post(`/api/queues/${queueId}/entries`)
    .set('Cookie', customer.cookieHeader)
    .set('X-CSRF-Token', customer.csrfToken);
}

function opPost(op: LoggedIn, path: string) {
  return request(app).post(path).set('Cookie', op.cookieHeader).set('X-CSRF-Token', op.csrfToken);
}

// ---------------------------------------------------------------------------------------------

describe('Issue #7: Sprint 1 integration, authorization and consistency (real API + PostgreSQL)', () => {
  let customer1: LoggedIn;
  let customer2: LoggedIn;
  let operator1: LoggedIn; // assigned to OPEN_QUEUE_ID by the seed
  let operator2: LoggedIn; // assigned to nothing by the seed

  beforeEach(async () => {
    await resetAndSeed();
    [customer1, customer2, operator1, operator2] = await Promise.all([
      login(app, CUSTOMER1.email),
      login(app, CUSTOMER2.email),
      login(app, OPERATOR1.email),
      login(app, OPERATOR2.email),
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------------------------
  describe('1. Authorization matrix over every protected endpoint (NFR-02, RBAC-001..005, AUTH-005)', () => {
    /** Builds the invalid-identity actors. Each one carries a CSRF token so only identity is tested. */
    async function invalidActors(): Promise<Actor[]> {
      const expired = await login(app, CUSTOMER1.email);
      await prisma.session.updateMany({
        where: { csrfToken: expired.csrfToken },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const tamperedToken =
        customer2.sessionToken.slice(0, -1) + (customer2.sessionToken.endsWith('A') ? 'B' : 'A');

      const loggedOut = await login(app, OPERATOR1.email);
      const logoutRes = await opPost(loggedOut, '/api/auth/logout');
      expect(logoutRes.status).toBe(204);

      return [
        { name: 'anonymous' },
        { name: 'anonymous + forged csrf', csrf: 'forged-token' },
        { name: 'expired session', cookie: expired.cookieHeader, csrf: expired.csrfToken },
        {
          name: 'tampered session cookie',
          cookie: `qms_session=${tamperedToken}; qms_csrf=${customer2.csrfToken}`,
          csrf: customer2.csrfToken,
        },
        { name: 'logged-out session reused', cookie: loggedOut.cookieHeader, csrf: loggedOut.csrfToken },
      ];
    }

    /** Fixture via the API: c1 SERVING (number 1), c2 CALLED (number 2), a third customer WAITING (number 3). */
    async function buildFixture() {
      const c1Join = await apiJoin(customer1);
      expect(c1Join.status).toBe(201);
      const c2Join = await apiJoin(customer2);
      expect(c2Join.status).toBe(201);

      // A third customer whose entry is driven to SERVING through the real API.
      const hash = await hashPassword(SEED_PASSWORD);
      await prisma.user.create({
        data: { email: 'matrix-c3@example.com', passwordHash: hash, role: 'CUSTOMER', accountStatus: 'ACTIVE' },
      });
      const c3 = await login(app, 'matrix-c3@example.com');
      expect((await apiJoin(c3)).status).toBe(201);

      // FIFO: call c1 -> CALLED, start it -> SERVING; call c2 -> CALLED; c3 stays WAITING.
      const call1 = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      expect(call1.body.data.entry.id).toBe(c1Join.body.data.entry.id);
      const servingId: string = call1.body.data.entry.id;
      expect((await opPost(operator1, `/api/operator/queue-entries/${servingId}/start`)).status).toBe(200);
      const call2 = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      const calledId: string = call2.body.data.entry.id;
      expect(calledId).toBe(c2Join.body.data.entry.id);

      return { c1EntryId: c1Join.body.data.entry.id as string, c2EntryId: calledId, calledId, servingId };
    }

    it('rejects every invalid identity with 401 UNAUTHORIZED on every protected endpoint, with no DB change', async () => {
      const fx = await buildFixture();
      const endpoints: Array<['get' | 'post', string]> = [
        ['get', '/api/auth/me'],
        ['post', '/api/auth/logout'],
        ['get', '/api/queues'],
        ['post', `/api/queues/${OPEN_QUEUE_ID}/entries`],
        ['get', '/api/me/queue-entries'],
        ['get', `/api/me/queue-entries/${fx.c1EntryId}`],
        ['get', '/api/operator/queues'],
        ['get', `/api/operator/queues/${OPEN_QUEUE_ID}/entries`],
        ['post', `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`],
        ['post', `/api/operator/queue-entries/${fx.calledId}/start`],
        ['post', `/api/operator/queue-entries/${fx.servingId}/complete`],
      ];
      const actors = await invalidActors();
      const before = await snapshot();
      const seen: string[] = [];

      for (const [method, path] of endpoints) {
        for (const actor of actors) {
          const res = await send(method, path, actor);
          seen.push(`${method.toUpperCase()} ${path} as ${actor.name} -> ${res.status}`);
          expectError(res, 401, 'UNAUTHORIZED');
          // No data from a protected resource may leak into a 401 body.
          expect(JSON.stringify(res.body)).not.toContain(CUSTOMER1.id);
          expect(JSON.stringify(res.body)).not.toContain(fx.c1EntryId);
        }
      }

      expect(seen).toHaveLength(endpoints.length * actors.length);
      expect(await snapshot()).toBe(before);
    });

    it('enforces role and assignment rules with the exact status/code per endpoint (customer, other customer, assigned and unassigned operator)', async () => {
      const fx = await buildFixture();
      const c1 = asActor('customer1', customer1);
      const c2 = asActor('customer2', customer2);
      const op1 = asActor('assigned operator1', operator1);
      const op2 = asActor('unassigned operator2', operator2);

      // [method, path, actor, expectedStatus, expectedErrorCode | null]
      // Successful mutations are deliberately left out of this table; they are in the next test.
      const rejections: Array<['get' | 'post', string, Actor, number, string]> = [
        // Customer endpoints called by operators
        ['post', `/api/queues/${OPEN_QUEUE_ID}/entries`, op1, 403, 'FORBIDDEN'],
        ['post', `/api/queues/${OPEN_QUEUE_ID}/entries`, op2, 403, 'FORBIDDEN'],
        ['get', '/api/me/queue-entries', op1, 403, 'FORBIDDEN'],
        ['get', '/api/me/queue-entries', op2, 403, 'FORBIDDEN'],
        ['get', `/api/me/queue-entries/${fx.c1EntryId}`, op1, 403, 'FORBIDDEN'],
        ['get', `/api/me/queue-entries/${fx.c1EntryId}`, op2, 403, 'FORBIDDEN'],
        // Cross-owner read is masked as 404, never 403 (api-spec §2, §7.4)
        ['get', `/api/me/queue-entries/${fx.c1EntryId}`, c2, 404, 'RESOURCE_NOT_FOUND'],
        ['get', `/api/me/queue-entries/${fx.c2EntryId}`, c1, 404, 'RESOURCE_NOT_FOUND'],
        // Operator endpoints called directly by customers (bypassing the UI)
        ['get', '/api/operator/queues', c1, 403, 'FORBIDDEN'],
        ['get', `/api/operator/queues/${OPEN_QUEUE_ID}/entries`, c1, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`, c1, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`, c2, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queue-entries/${fx.calledId}/start`, c1, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queue-entries/${fx.calledId}/start`, c2, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queue-entries/${fx.servingId}/complete`, c1, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queue-entries/${fx.servingId}/complete`, c2, 403, 'FORBIDDEN'],
        // Unassigned operator on another operator's queue
        ['get', `/api/operator/queues/${OPEN_QUEUE_ID}/entries`, op2, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`, op2, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queue-entries/${fx.calledId}/start`, op2, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queue-entries/${fx.servingId}/complete`, op2, 403, 'FORBIDDEN'],
        // Assigned operator on a queue that is not theirs (CLOSED queue, nobody assigned)
        ['get', `/api/operator/queues/${CLOSED_QUEUE_ID}/entries`, op1, 403, 'FORBIDDEN'],
        ['post', `/api/operator/queues/${CLOSED_QUEUE_ID}/call-next`, op1, 403, 'FORBIDDEN'],
      ];

      const before = await snapshot();
      for (const [method, path, actor, status, code] of rejections) {
        const res = await send(method, path, actor);
        try {
          expectError(res, status, code);
        } catch (err) {
          throw new Error(`${method.toUpperCase()} ${path} as ${actor.name}: ${(err as Error).message}`);
        }
        // A rejected caller never sees another customer's id or the entry payload.
        expect(JSON.stringify(res.body)).not.toContain(CUSTOMER1.id);
        expect(JSON.stringify(res.body)).not.toContain(CUSTOMER2.id);
      }
      expect(await snapshot()).toBe(before);

      // Allowed reads return 200 and only the caller's own / assigned data.
      const meC1 = await send('get', '/api/me/queue-entries', c1);
      expect(meC1.status).toBe(200);
      expect(meC1.body.data.entries.every((e: { customerId: string }) => e.customerId === CUSTOMER1.id)).toBe(true);
      const detailC1 = await send('get', `/api/me/queue-entries/${fx.c1EntryId}`, c1);
      expect(detailC1.status).toBe(200);
      expect(detailC1.body.data.entry.customerId).toBe(CUSTOMER1.id);
      const op1Queues = await send('get', '/api/operator/queues', op1);
      expect(op1Queues.body.data.queues.map((q: { id: string }) => q.id)).toEqual([OPEN_QUEUE_ID]);
      const op2Queues = await send('get', '/api/operator/queues', op2);
      expect(op2Queues.status).toBe(200);
      expect(op2Queues.body.data.queues).toEqual([]);
      for (const actor of [c1, c2, op1, op2]) {
        const me = await send('get', '/api/auth/me', actor);
        expect(me.status).toBe(200);
        const catalog = await send('get', '/api/queues', actor);
        expect(catalog.status).toBe(200);
        expect(catalog.body.data.queues.map((q: { id: string }) => q.id)).toEqual([OPEN_QUEUE_ID]);
      }
      expect(await snapshot()).toBe(before);
      await assertDbInvariants();
    });

    it('allows the assigned operator to perform each mutation that the matrix rejected for everyone else', async () => {
      const fx = await buildFixture();
      const op1 = asActor('assigned operator1', operator1);

      const complete = await send('post', `/api/operator/queue-entries/${fx.servingId}/complete`, op1);
      expect(complete.status).toBe(200);
      expect(complete.body.data.entry.status).toBe('COMPLETED');
      const start = await send('post', `/api/operator/queue-entries/${fx.calledId}/start`, op1);
      expect(start.status).toBe(200);
      expect(start.body.data.entry.status).toBe('SERVING');
      const callNext = await send('post', `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`, op1);
      expect(callNext.status).toBe(200);
      expect(callNext.body.data.entry.status).toBe('CALLED');
      await assertDbInvariants();
    });

    it('a logged-out session cannot be reused for reads or mutations, and its old CSRF token is dead too', async () => {
      const before = await snapshot();
      const logout = await opPost(customer1, '/api/auth/logout');
      expect(logout.status).toBe(204);
      expect(await prisma.session.count({ where: { csrfToken: customer1.csrfToken } })).toBe(0);

      expectError(await send('get', '/api/me/queue-entries', asActor('c1 after logout', customer1)), 401, 'UNAUTHORIZED');
      expectError(await apiJoin(customer1), 401, 'UNAUTHORIZED');
      expectError(await opPost(customer1, '/api/auth/logout'), 401, 'UNAUTHORIZED');
      expect(await snapshot()).toBe(before);

      // Logging out one session does not affect other users' sessions.
      expect((await send('get', '/api/auth/me', asActor('customer2', customer2))).status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('2. CSRF matrix on every mutation (SEC-002): missing, wrong, and another session\'s token', () => {
    it('rejects each bad token with 403 FORBIDDEN before any mutation (counter, rows and statuses unchanged)', async () => {
      // Fixture through the API (c1 SERVING, c2 CALLED, c3 WAITING) so every mutation has a valid target.
      expect((await apiJoin(customer1)).status).toBe(201);
      expect((await apiJoin(customer2)).status).toBe(201);
      const first = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      const servingId: string = first.body.data.entry.id;
      expect((await opPost(operator1, `/api/operator/queue-entries/${servingId}/start`)).status).toBe(200);
      const second = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      const calledId: string = second.body.data.entry.id;
      // Re-open a WAITING entry for call-next: a third customer joins.
      const hash = await hashPassword(SEED_PASSWORD);
      await prisma.user.create({
        data: { email: 'csrf-c3@example.com', passwordHash: hash, role: 'CUSTOMER', accountStatus: 'ACTIVE' },
      });
      expect((await apiJoin(await login(app, 'csrf-c3@example.com'))).status).toBe(201);

      // Another login of the same operator gives a *different* valid session with its own token.
      const operator1Other = await login(app, OPERATOR1.email);
      const customer1Other = await login(app, CUSTOMER1.email);

      const mutations: Array<{ path: string; session: LoggedIn; other: LoggedIn }> = [
        { path: `/api/queues/${OPEN_QUEUE_ID}/entries`, session: customer2, other: customer1Other },
        { path: `/api/queues/${CLOSED_QUEUE_ID}/entries`, session: customer2, other: customer1Other },
        { path: `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`, session: operator1, other: operator1Other },
        { path: `/api/operator/queue-entries/${calledId}/start`, session: operator1, other: operator1Other },
        { path: `/api/operator/queue-entries/${servingId}/complete`, session: operator1, other: operator1Other },
        { path: '/api/auth/logout', session: operator1, other: operator1Other },
      ];

      const before = await snapshot();
      const sessionsBefore = await prisma.session.count();
      for (const m of mutations) {
        const variants: Array<[string, string | undefined]> = [
          ['missing', undefined],
          ['empty', ''],
          ['wrong', m.session.csrfToken.split('').reverse().join('') + 'x'],
          ["another session's token", m.other.csrfToken],
        ];
        for (const [label, token] of variants) {
          let req = request(app).post(m.path).set('Cookie', m.session.cookieHeader);
          if (token !== undefined) req = req.set('X-CSRF-Token', token);
          const res = await req;
          try {
            expectError(res, 403, 'FORBIDDEN');
          } catch (err) {
            throw new Error(`POST ${m.path} with ${label} CSRF token: ${(err as Error).message}`);
          }
        }
      }
      expect(await snapshot()).toBe(before);
      // A rejected logout must not destroy the session either.
      expect(await prisma.session.count()).toBe(sessionsBefore);
      expect(await lastQueueNumber(OPEN_QUEUE_ID)).toBe(3n);
      expect(await lastQueueNumber(CLOSED_QUEUE_ID)).toBe(0n);
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('3. Cross-role business flow driven only through the API (FLOW-009/FLOW-010 at API level)', () => {
    it('join -> duplicate/closed rejections -> FIFO call -> full lifecycle -> rejoin -> empty call-next, with consistent customer views', async () => {
      // Two customers join the same queue: contiguous, per-queue numbers.
      const j1 = await apiJoin(customer1);
      const j2 = await apiJoin(customer2);
      expect([j1.status, j2.status]).toEqual([201, 201]);
      expect([j1.body.data.entry.queueNumber, j2.body.data.entry.queueNumber]).toEqual([1, 2]);
      expect(j1.body.data.entry.status).toBe('WAITING');
      expect(j1.body.data.entry.calledAt).toBeNull();
      const e1: string = j1.body.data.entry.id;
      const e2: string = j2.body.data.entry.id;

      // Duplicate active join rejected and does not advance the counter.
      expectError(await apiJoin(customer1), 409, 'DUPLICATE_ACTIVE_ENTRY');
      expect(await lastQueueNumber(OPEN_QUEUE_ID)).toBe(2n);
      // Closed queue join rejected; its counter stays at 0 and no row is created.
      expectError(await apiJoin(customer1, CLOSED_QUEUE_ID), 409, 'QUEUE_NOT_AVAILABLE');
      expect(await lastQueueNumber(CLOSED_QUEUE_ID)).toBe(0n);
      expect(await prisma.queueEntry.count({ where: { serviceQueueId: CLOSED_QUEUE_ID } })).toBe(0);

      // Operator sees FIFO order joinedAt ASC, id ASC.
      const list = await request(app)
        .get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`)
        .set('Cookie', operator1.cookieHeader);
      expect(list.status).toBe(200);
      expect(list.body.data.entries.map((e: { id: string }) => e.id)).toEqual([e1, e2]);

      // Customer 2 is one behind customer 1.
      const c2Before = await request(app).get(`/api/me/queue-entries/${e2}`).set('Cookie', customer2.cookieHeader);
      expect(c2Before.body.data.entry.aheadCount).toBe(1);

      // Out-of-order transitions on WAITING entries are 409 and change nothing.
      let before = await snapshot();
      expectError(await opPost(operator1, `/api/operator/queue-entries/${e1}/start`), 409, 'INVALID_STATE_TRANSITION');
      expectError(await opPost(operator1, `/api/operator/queue-entries/${e1}/complete`), 409, 'INVALID_STATE_TRANSITION');
      expect(await snapshot()).toBe(before);

      // Call next -> oldest (customer 1).
      const call1 = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      expect(call1.status).toBe(200);
      expect(call1.body.data.entry).toMatchObject({ id: e1, status: 'CALLED', serviceStartedAt: null, completedAt: null });
      expect(call1.body.data.entry.calledAt).not.toBeNull();

      // Both customers see the change through their own endpoints only.
      const c1Called = await request(app).get(`/api/me/queue-entries/${e1}`).set('Cookie', customer1.cookieHeader);
      expect(c1Called.body.data.entry).toMatchObject({ status: 'CALLED', aheadCount: 0, calledAt: call1.body.data.entry.calledAt });
      const c2After = await request(app).get(`/api/me/queue-entries/${e2}`).set('Cookie', customer2.cookieHeader);
      expect(c2After.body.data.entry.aheadCount).toBe(0);

      // CALLED: complete is illegal; duplicate join still rejected (CALLED is active).
      before = await snapshot();
      expectError(await opPost(operator1, `/api/operator/queue-entries/${e1}/complete`), 409, 'INVALID_STATE_TRANSITION');
      expectError(await apiJoin(customer1), 409, 'DUPLICATE_ACTIVE_ENTRY');
      expect(await snapshot()).toBe(before);

      // CALLED -> SERVING.
      const start = await opPost(operator1, `/api/operator/queue-entries/${e1}/start`);
      expect(start.status).toBe(200);
      expect(start.body.data.entry).toMatchObject({ status: 'SERVING', calledAt: call1.body.data.entry.calledAt, completedAt: null });
      expect(start.body.data.entry.serviceStartedAt).not.toBeNull();

      // SERVING: start again is illegal; duplicate join still rejected.
      before = await snapshot();
      expectError(await opPost(operator1, `/api/operator/queue-entries/${e1}/start`), 409, 'INVALID_STATE_TRANSITION');
      expectError(await apiJoin(customer1), 409, 'DUPLICATE_ACTIVE_ENTRY');
      expect(await snapshot()).toBe(before);

      // SERVING -> COMPLETED with monotonic timestamps.
      const done = await opPost(operator1, `/api/operator/queue-entries/${e1}/complete`);
      expect(done.status).toBe(200);
      const fin = done.body.data.entry;
      expect(fin.status).toBe('COMPLETED');
      const ts = [fin.joinedAt, fin.calledAt, fin.serviceStartedAt, fin.completedAt].map((v: string) => Date.parse(v));
      expect(ts.every((t: number) => Number.isFinite(t))).toBe(true);
      expect([...ts].sort((a, b) => a - b)).toEqual(ts);
      for (const v of [fin.joinedAt, fin.calledAt, fin.serviceStartedAt, fin.completedAt]) {
        expect(v).toMatch(/Z$/); // RFC 3339 UTC
      }

      // COMPLETED is terminal.
      before = await snapshot();
      for (const action of ['start', 'complete']) {
        expectError(await opPost(operator1, `/api/operator/queue-entries/${e1}/${action}`), 409, 'INVALID_STATE_TRANSITION');
      }
      expect(await snapshot()).toBe(before);

      // Customer 1 sees COMPLETED (history kept) and may rejoin: next number is 3, not reused.
      const c1Done = await request(app).get(`/api/me/queue-entries/${e1}`).set('Cookie', customer1.cookieHeader);
      expect(c1Done.body.data.entry).toMatchObject({ status: 'COMPLETED', aheadCount: 0 });
      const rejoin = await apiJoin(customer1);
      expect(rejoin.status).toBe(201);
      expect(rejoin.body.data.entry.queueNumber).toBe(3);
      const history = await request(app).get('/api/me/queue-entries').set('Cookie', customer1.cookieHeader);
      expect(history.body.data.entries.map((e: { id: string }) => e.id)).toEqual([rejoin.body.data.entry.id, e1]);

      // FIFO continues: customer 2 (joined before the rejoin) is called before customer 1's new entry.
      const call2 = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      expect(call2.body.data.entry.id).toBe(e2);
      const call3 = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      expect(call3.body.data.entry.id).toBe(rejoin.body.data.entry.id);

      // Nothing left WAITING: 204, empty body, no mutation.
      before = await snapshot();
      const empty = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      expect(empty.status).toBe(204);
      expect(empty.text).toBe('');
      expect(await snapshot()).toBe(before);

      await assertDbInvariants();
    });
  });

  // -------------------------------------------------------------------------------------------
  describe('4. Mixed concurrency with SQL invariants (NFR-03, CONCURRENCY-001..004 extensions)', () => {
    async function makeCustomers(n: number, prefix: string): Promise<LoggedIn[]> {
      const hash = await hashPassword(SEED_PASSWORD);
      await prisma.user.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          email: `${prefix}-${i}@example.com`,
          passwordHash: hash,
          role: 'CUSTOMER' as const,
          accountStatus: 'ACTIVE' as const,
        })),
      });
      return Promise.all(Array.from({ length: n }, (_, i) => login(app, `${prefix}-${i}@example.com`)));
    }

    it('joins racing call-next from two assigned operators: contiguous numbers, no double claim, invariants hold', async () => {
      await prisma.operatorAssignment.create({ data: { operatorId: OPERATOR2.id, serviceQueueId: OPEN_QUEUE_ID } });
      const customers = await makeCustomers(10, 'race-join');

      const joins = customers.map((c) => apiJoin(c));
      const calls = Array.from({ length: 12 }, (_, i) =>
        opPost(i % 2 === 0 ? operator1 : operator2, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)
      );
      const results = await Promise.all([...joins, ...calls]);
      const joinRes = results.slice(0, joins.length);
      const callRes = results.slice(joins.length);

      expect(joinRes.map((r) => r.status)).toEqual(Array(10).fill(201));
      const numbers = joinRes.map((r) => r.body.data.entry.queueNumber).sort((a: number, b: number) => a - b);
      expect(numbers).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
      expect(await lastQueueNumber(OPEN_QUEUE_ID)).toBe(10n);

      for (const r of callRes) expect([200, 204]).toContain(r.status);
      const claimed = callRes.filter((r) => r.status === 200).map((r) => r.body.data.entry.id as string);
      expect(new Set(claimed).size).toBe(claimed.length); // never the same entry twice

      // Whatever the interleaving, the DB must agree with the responses.
      const called = await prisma.queueEntry.findMany({ where: { status: 'CALLED' } });
      expect(called.map((e) => e.id).sort()).toEqual([...claimed].sort());

      // Drain the rest sequentially: FIFO order of the remaining WAITING entries is respected.
      const waiting = await prisma.queueEntry.findMany({
        where: { serviceQueueId: OPEN_QUEUE_ID, status: 'WAITING' },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      });
      for (const w of waiting) {
        const r = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
        expect(r.body.data.entry.id).toBe(w.id);
      }
      expect((await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`)).status).toBe(204);
      expect(await prisma.queueEntry.count({ where: { status: 'CALLED' } })).toBe(10);

      await assertDbInvariants();
    });

    it('parallel duplicate joins from several customers at once: exactly one 201 each, counter equals customers', async () => {
      const customers = await makeCustomers(4, 'race-dup');
      const attempts = customers.flatMap((c) => Array.from({ length: 4 }, () => apiJoin(c)));
      const res = await Promise.all(attempts);

      for (let i = 0; i < customers.length; i++) {
        const mine = res.slice(i * 4, i * 4 + 4);
        expect(mine.filter((r) => r.status === 201)).toHaveLength(1);
        for (const r of mine.filter((x) => x.status !== 201)) expectError(r, 409, 'DUPLICATE_ACTIVE_ENTRY');
      }
      // Rejected duplicates never consume a number: 4 customers -> numbers 1..4, counter 4.
      expect(await lastQueueNumber(OPEN_QUEUE_ID)).toBe(4n);
      const rows = await prisma.queueEntry.findMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });
      expect(rows.map((r) => Number(r.queueNumber)).sort()).toEqual([1, 2, 3, 4]);
      await assertDbInvariants();
    });

    it('start/complete storm across several entries from two operators: each transition happens once, invariants hold', async () => {
      await prisma.operatorAssignment.create({ data: { operatorId: OPERATOR2.id, serviceQueueId: OPEN_QUEUE_ID } });
      const customers = await makeCustomers(4, 'race-life');
      for (const c of customers) expect((await apiJoin(c)).status).toBe(201);
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await opPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
        ids.push(r.body.data.entry.id);
      }

      // Fire start and complete for every entry at the same time, from both operators, 3 times each.
      const fired: Array<{ id: string; action: 'start' | 'complete'; p: Promise<Response> }> = [];
      for (let round = 0; round < 3; round++) {
        for (const id of ids) {
          for (const action of ['complete', 'start'] as const) {
            const op = (round + fired.length) % 2 === 0 ? operator1 : operator2;
            fired.push({ id, action, p: opPost(op, `/api/operator/queue-entries/${id}/${action}`) });
          }
        }
      }
      const settled = await Promise.all(fired.map((f) => f.p));

      for (const id of ids) {
        const starts = settled.filter((_, i) => fired[i].id === id && fired[i].action === 'start');
        const completes = settled.filter((_, i) => fired[i].id === id && fired[i].action === 'complete');
        // Exactly one start succeeds; every other start is a 409 (never a 500).
        expect(starts.filter((r) => r.status === 200)).toHaveLength(1);
        for (const r of starts.filter((x) => x.status !== 200)) expectError(r, 409, 'INVALID_STATE_TRANSITION');
        // At most one complete succeeds (it may lose every race to start); the rest are 409.
        const okCompletes = completes.filter((r) => r.status === 200);
        expect(okCompletes.length).toBeLessThanOrEqual(1);
        for (const r of completes.filter((x) => x.status !== 200)) expectError(r, 409, 'INVALID_STATE_TRANSITION');

        const row = await prisma.queueEntry.findUniqueOrThrow({ where: { id } });
        expect(row.status).toBe(okCompletes.length === 1 ? 'COMPLETED' : 'SERVING');
        const okStart = starts.find((r) => r.status === 200)!;
        expect(row.serviceStartedAt?.toISOString()).toBe(okStart.body.data.entry.serviceStartedAt);
      }
      await assertDbInvariants();
    });
  });
});
