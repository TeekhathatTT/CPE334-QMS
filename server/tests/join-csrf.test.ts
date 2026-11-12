import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { resetAndSeed, login, CUSTOMER1, CUSTOMER2, OPEN_QUEUE_ID, type LoggedIn } from './helpers/auth';

/**
 * SEC-002 on the real join endpoint (Issue #5): `POST /api/queues/{queueId}/entries` must reject a
 * missing, wrong, or cross-session `X-CSRF-Token` with `403 FORBIDDEN` before any mutation, and accept
 * the caller's own token. Runs against the isolated PostgreSQL test database.
 */
describe('Issue #5: SEC-002 CSRF enforcement on POST /api/queues/{queueId}/entries', () => {
  let customer1: LoggedIn;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    await resetAndSeed();
    customer1 = await login(app, CUSTOMER1.email);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function snapshot() {
    const queue = await prisma.serviceQueue.findUniqueOrThrow({ where: { id: OPEN_QUEUE_ID } });
    const entries = await prisma.queueEntry.count();
    return { lastQueueNumber: queue.lastQueueNumber, entries };
  }

  async function expectRejectedWithoutSideEffects(csrfToken: string | undefined) {
    const before = await snapshot();

    let req = request(app).post(`/api/queues/${OPEN_QUEUE_ID}/entries`).set('Cookie', customer1.cookieHeader);
    if (csrfToken !== undefined) {
      req = req.set('X-CSRF-Token', csrfToken);
    }
    const res = await req;

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(typeof res.body.error.requestId).toBe('string');
    expect(res.body.data).toBeUndefined();
    // No internals leak through the error body.
    expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|select|csrfToken/i);

    const after = await snapshot();
    expect(after.entries).toBe(before.entries);
    expect(after.entries).toBe(0);
    expect(after.lastQueueNumber).toBe(before.lastQueueNumber);
    expect(await prisma.queueEntry.count({ where: { customerId: CUSTOMER1.id } })).toBe(0);
  }

  it('rejects a request with no X-CSRF-Token: 403 FORBIDDEN, no entry, counter unchanged', async () => {
    await expectRejectedWithoutSideEffects(undefined);
  });

  it('rejects a wrong X-CSRF-Token: 403 FORBIDDEN, no entry, counter unchanged', async () => {
    const wrong = customer1.csrfToken.split('').reverse().join('') + 'x';
    expect(wrong).not.toBe(customer1.csrfToken);
    await expectRejectedWithoutSideEffects(wrong);
  });

  it('rejects an empty X-CSRF-Token: 403 FORBIDDEN, no entry, counter unchanged', async () => {
    await expectRejectedWithoutSideEffects('');
  });

  it("rejects another user's session CSRF token: 403 FORBIDDEN, no entry, counter unchanged", async () => {
    const customer2 = await login(app, CUSTOMER2.email);
    expect(customer2.csrfToken).not.toBe(customer1.csrfToken);

    await expectRejectedWithoutSideEffects(customer2.csrfToken);

    // The other user's session is unaffected and still works with its own token.
    expect(await prisma.queueEntry.count({ where: { customerId: CUSTOMER2.id } })).toBe(0);
  });

  it('accepts the valid token: 201, exactly one WAITING entry, next queue number allocated', async () => {
    const before = await snapshot();

    const res = await request(app)
      .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
      .set('Cookie', customer1.cookieHeader)
      .set('X-CSRF-Token', customer1.csrfToken);

    expect(res.status).toBe(201);
    const entry = res.body.data.entry;
    expect(entry.status).toBe('WAITING');
    expect(entry.serviceQueueId).toBe(OPEN_QUEUE_ID);
    expect(entry.customerId).toBe(CUSTOMER1.id);
    expect(BigInt(entry.queueNumber)).toBe(before.lastQueueNumber + 1n);

    const after = await snapshot();
    expect(after.entries).toBe(before.entries + 1);
    expect(after.lastQueueNumber).toBe(before.lastQueueNumber + 1n);
    const rows = await prisma.queueEntry.findMany({ where: { customerId: CUSTOMER1.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(entry.id);
    expect(rows[0].queueNumber).toBe(before.lastQueueNumber + 1n);
  });

  it('a rejected attempt does not consume a number: the next valid join still gets the next number', async () => {
    const before = await snapshot();
    await request(app).post(`/api/queues/${OPEN_QUEUE_ID}/entries`).set('Cookie', customer1.cookieHeader);
    await request(app)
      .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
      .set('Cookie', customer1.cookieHeader)
      .set('X-CSRF-Token', 'wrong-token');

    const res = await request(app)
      .post(`/api/queues/${OPEN_QUEUE_ID}/entries`)
      .set('Cookie', customer1.cookieHeader)
      .set('X-CSRF-Token', customer1.csrfToken);

    expect(res.status).toBe(201);
    expect(BigInt(res.body.data.entry.queueNumber)).toBe(before.lastQueueNumber + 1n);
    expect((await snapshot()).entries).toBe(1);
  });
});
