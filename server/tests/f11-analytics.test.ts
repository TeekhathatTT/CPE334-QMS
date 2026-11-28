/**
 * F-11 Operational analytics: API + real PostgreSQL integration tests.
 * Canonical STS: ANALYTICS-002 – ANALYTICS-009 in docs/sprints/sprint-3/tests.md §2.2,
 * using the known dataset DS-11 (§2.1). Contract: docs/sprints/sprint-3/api-spec.md §2,
 * docs/features/sprint-3-f11-operational-analytics.md v1.0, SRS BR-24 – BR-26, AC-56 – AC-60.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { AccountStatus, QueuePriority, QueueStatus, Role } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/db';
import {
  resetAndSeed,
  login,
  CUSTOMER1,
  CUSTOMER2,
  OPERATOR1,
  OPERATOR2,
  OPEN_QUEUE_ID as Q,
  CLOSED_QUEUE_ID as R,
  type LoggedIn,
} from './helpers/auth';

const UNKNOWN_V4 = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const EXTRA_CUSTOMERS = [
  '55555555-5555-4555-8555-555555555553',
  '55555555-5555-4555-8555-555555555554',
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555556',
];
const [C3, C4, C5, C6] = EXTRA_CUSTOMERS;

const at = (iso: string, plusSeconds = 0) => new Date(Date.parse(iso) + plusSeconds * 1000);

interface Ds11Row {
  key: string;
  queue: string;
  customerId: string;
  joinedAt: string;
  status: QueueStatus;
  calledAt?: number;
  serviceStartedAt?: number;
  completedAt?: number;
  cancelledAt?: number;
  noShowAt?: number;
  recoveredAt?: number;
  noShowCount?: number;
  priority?: QueuePriority;
}

/** DS-11, docs/sprints/sprint-3/tests.md §2.1 (offsets are seconds after joinedAt). */
const DS11: Ds11Row[] = [
  { key: 'E1', queue: Q, customerId: CUSTOMER1.id, joinedAt: '2026-11-20T02:00:00.000Z', status: 'COMPLETED', calledAt: 300, serviceStartedAt: 360, completedAt: 960 },
  { key: 'E2', queue: Q, customerId: CUSTOMER2.id, joinedAt: '2026-11-20T03:00:00.000Z', status: 'COMPLETED', calledAt: 120, serviceStartedAt: 150, completedAt: 450 },
  { key: 'E3', queue: Q, customerId: CUSTOMER1.id, joinedAt: '2026-11-21T02:00:00.000Z', status: 'COMPLETED', calledAt: 600, serviceStartedAt: 620, completedAt: 1520 },
  { key: 'E4', queue: Q, customerId: CUSTOMER2.id, joinedAt: '2026-11-21T04:00:00.000Z', status: 'CANCELLED', cancelledAt: 200 },
  { key: 'E5', queue: Q, customerId: CUSTOMER1.id, joinedAt: '2026-11-22T02:00:00.000Z', status: 'NO_SHOW', calledAt: 450, noShowAt: 630, noShowCount: 1 },
  { key: 'E6', queue: Q, customerId: CUSTOMER2.id, joinedAt: '2026-11-22T05:00:00.000Z', status: 'COMPLETED', calledAt: 900, serviceStartedAt: 960, completedAt: 1440, noShowAt: 400, recoveredAt: 500, noShowCount: 1, priority: 'PRIORITY' },
  { key: 'E7', queue: Q, customerId: C3, joinedAt: '2026-11-24T02:00:00.000Z', status: 'SERVING', calledAt: 60, serviceStartedAt: 90 },
  { key: 'E8', queue: Q, customerId: C4, joinedAt: '2026-11-26T09:00:00.000Z', status: 'WAITING' },
  { key: 'E9', queue: Q, customerId: C5, joinedAt: '2026-11-26T16:59:59.999Z', status: 'CALLED', calledAt: 30 },
  { key: 'X1', queue: Q, customerId: C6, joinedAt: '2026-11-26T17:00:00.000Z', status: 'WAITING' },
  { key: 'X2', queue: Q, customerId: CUSTOMER1.id, joinedAt: '2026-11-19T16:59:59.999Z', status: 'COMPLETED', calledAt: 100, serviceStartedAt: 110, completedAt: 210 },
  { key: 'X3', queue: R, customerId: CUSTOMER1.id, joinedAt: '2026-11-21T02:00:00.000Z', status: 'COMPLETED', calledAt: 50, serviceStartedAt: 60, completedAt: 160 },
];

const EXPECTED_DS11 = {
  queueId: Q,
  queueName: 'General Inquiry Desk',
  from: '2026-11-20',
  to: '2026-11-26',
  timezone: 'Asia/Bangkok',
  volumes: { joined: 9, waiting: 1, called: 1, serving: 1, completed: 4, cancelled: 1, noShow: 1, recovered: 1, priority: 1 },
  waitTime: { count: 7, averageSeconds: 351.4, medianSeconds: 300, p90Seconds: 720, maxSeconds: 900 },
  serviceTime: { count: 4, averageSeconds: 570, medianSeconds: 540, p90Seconds: 810, maxSeconds: 900 },
  daily: [
    { date: '2026-11-20', joined: 2, completed: 2, cancelled: 0, noShow: 0, averageWaitSeconds: 210, averageServiceSeconds: 450 },
    { date: '2026-11-21', joined: 2, completed: 1, cancelled: 1, noShow: 0, averageWaitSeconds: 600, averageServiceSeconds: 900 },
    { date: '2026-11-22', joined: 2, completed: 1, cancelled: 0, noShow: 1, averageWaitSeconds: 675, averageServiceSeconds: 480 },
    { date: '2026-11-23', joined: 0, completed: 0, cancelled: 0, noShow: 0, averageWaitSeconds: null, averageServiceSeconds: null },
    { date: '2026-11-24', joined: 1, completed: 0, cancelled: 0, noShow: 0, averageWaitSeconds: 60, averageServiceSeconds: null },
    { date: '2026-11-25', joined: 0, completed: 0, cancelled: 0, noShow: 0, averageWaitSeconds: null, averageServiceSeconds: null },
    { date: '2026-11-26', joined: 2, completed: 0, cancelled: 0, noShow: 0, averageWaitSeconds: 30, averageServiceSeconds: null },
  ],
};

const ids = new Map<string, string>();

async function insertDs11(skip: string[] = []): Promise<void> {
  ids.clear();
  for (const id of EXTRA_CUSTOMERS) {
    await prisma.user.create({
      data: {
        id,
        email: `analytics-${id.slice(-1)}@example.com`,
        passwordHash: 'not-a-login-account',
        role: Role.CUSTOMER,
        accountStatus: AccountStatus.ACTIVE,
      },
    });
  }
  const numbers = new Map<string, number>();
  for (const row of DS11) {
    const n = (numbers.get(row.queue) ?? 0) + 1;
    numbers.set(row.queue, n);
    if (skip.includes(row.key)) continue;
    const off = (s?: number) => (s === undefined ? null : at(row.joinedAt, s));
    const created = await prisma.queueEntry.create({
      data: {
        customerId: row.customerId,
        serviceQueueId: row.queue,
        queueNumber: BigInt(n),
        status: row.status,
        priority: row.priority ?? 'NORMAL',
        joinedAt: new Date(row.joinedAt),
        calledAt: off(row.calledAt),
        serviceStartedAt: off(row.serviceStartedAt),
        completedAt: off(row.completedAt),
        cancelledAt: off(row.cancelledAt),
        noShowAt: off(row.noShowAt),
        recoveredAt: off(row.recoveredAt),
        noShowCount: row.noShowCount ?? 0,
      },
    });
    ids.set(row.key, created.id);
  }
  for (const [queue, n] of numbers) {
    await prisma.serviceQueue.update({ where: { id: queue }, data: { lastQueueNumber: BigInt(n) } });
  }
}

function analytics(user: LoggedIn | null, query: string, queueId = Q) {
  const req = request(app).get(`/api/operator/queues/${queueId}/analytics${query}`);
  if (user) req.set('Cookie', user.cookieHeader);
  return req;
}

const RANGE = '?from=2026-11-20&to=2026-11-26';

async function snapshot() {
  const entries = await prisma.$queryRaw<unknown[]>`SELECT * FROM "QueueEntry" ORDER BY "id"`;
  const queues = await prisma.$queryRaw<unknown[]>`SELECT * FROM "ServiceQueue" ORDER BY "id"`;
  return JSON.stringify({ entries, queues }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function bangkokToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

describe('F-11: operational analytics API', () => {
  let customer1: LoggedIn;
  let operator1: LoggedIn;
  let operator2: LoggedIn;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(async () => {
    await resetAndSeed();
    [customer1, operator1, operator2] = await Promise.all([
      login(app, CUSTOMER1.email),
      login(app, OPERATOR1.email),
      login(app, OPERATOR2.email),
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ANALYTICS-002 (AC-56): DS-11 report matches the expected volumes, statistics and daily rows exactly', async () => {
    await insertDs11();
    const res = await analytics(operator1, RANGE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { analytics: EXPECTED_DS11 } });
    const v = res.body.data.analytics.volumes;
    expect(v.waiting + v.called + v.serving + v.completed + v.cancelled + v.noShow).toBe(v.joined);
  });

  it('ANALYTICS-003 (AC-57): empty ranges return zeros, null statistics and one zero row per day', async () => {
    await insertDs11();
    for (const [query, days] of [
      ['?from=2026-11-23&to=2026-11-23', ['2026-11-23']],
      ['?from=2026-12-01&to=2026-12-07', ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07']],
    ] as const) {
      const res = await analytics(operator1, query);
      expect(res.status).toBe(200);
      const a = res.body.data.analytics;
      expect(a.volumes).toEqual({ joined: 0, waiting: 0, called: 0, serving: 0, completed: 0, cancelled: 0, noShow: 0, recovered: 0, priority: 0 });
      const empty = { count: 0, averageSeconds: null, medianSeconds: null, p90Seconds: null, maxSeconds: null };
      expect(a.waitTime).toEqual(empty);
      expect(a.serviceTime).toEqual(empty);
      expect(a.daily).toEqual(
        days.map((date) => ({ date, joined: 0, completed: 0, cancelled: 0, noShow: 0, averageWaitSeconds: null, averageServiceSeconds: null }))
      );
    }
  });

  it('ANALYTICS-004 (AC-57): each row contributes only to the buckets its timestamps allow; X1–X3 never count', async () => {
    await insertDs11();
    const full = (await analytics(operator1, RANGE)).body.data.analytics;

    const cases: Array<{ skip: string; volumes: Record<string, number>; wait: number; service: number }> = [
      { skip: 'E8', volumes: { joined: -1, waiting: -1 }, wait: 0, service: 0 },
      { skip: 'E7', volumes: { joined: -1, serving: -1 }, wait: -1, service: 0 },
      { skip: 'E9', volumes: { joined: -1, called: -1 }, wait: -1, service: 0 },
      { skip: 'E4', volumes: { joined: -1, cancelled: -1 }, wait: 0, service: 0 },
      { skip: 'E5', volumes: { joined: -1, noShow: -1 }, wait: -1, service: 0 },
      { skip: 'E6', volumes: { joined: -1, completed: -1, recovered: -1, priority: -1 }, wait: -1, service: -1 },
      { skip: 'X1', volumes: {}, wait: 0, service: 0 },
      { skip: 'X2', volumes: {}, wait: 0, service: 0 },
      { skip: 'X3', volumes: {}, wait: 0, service: 0 },
    ];
    for (const c of cases) {
      await resetAndSeed();
      await insertDs11([c.skip]);
      const a = (await analytics(operator1, RANGE)).body.data.analytics;
      const expectedVolumes = { ...full.volumes };
      for (const [k, d] of Object.entries(c.volumes)) expectedVolumes[k] += d;
      expect(a.volumes, `without ${c.skip}`).toEqual(expectedVolumes);
      expect(a.waitTime.count, `waitTime.count without ${c.skip}`).toBe(full.waitTime.count + c.wait);
      expect(a.serviceTime.count, `serviceTime.count without ${c.skip}`).toBe(full.serviceTime.count + c.service);
    }

    // E6 (recovered) contributes its latest-call waiting time of 900 s, which is the maximum.
    await resetAndSeed();
    await insertDs11(['E6']);
    const withoutE6 = (await analytics(operator1, RANGE)).body.data.analytics;
    expect(withoutE6.waitTime.maxSeconds).toBe(600);
    expect(full.waitTime.maxSeconds).toBe(900);
  });

  it('ANALYTICS-005 (AC-58): Asia/Bangkok day boundaries', async () => {
    await insertDs11();
    const day26 = (await analytics(operator1, '?from=2026-11-26&to=2026-11-26')).body.data.analytics;
    expect(day26.volumes.joined).toBe(2);
    expect(day26.volumes.waiting).toBe(1);
    expect(day26.volumes.called).toBe(1);
    expect(day26.daily).toHaveLength(1);
    expect(day26.daily[0].date).toBe('2026-11-26');

    const day27 = (await analytics(operator1, '?from=2026-11-27&to=2026-11-27')).body.data.analytics;
    expect(day27.volumes.joined).toBe(1);
    expect(day27.volumes.waiting).toBe(1);

    const day19 = (await analytics(operator1, '?from=2026-11-19&to=2026-11-19')).body.data.analytics;
    expect(day19.volumes.joined).toBe(1);
    expect(day19.volumes.completed).toBe(1);
  });

  it('ANALYTICS-006 (AC-59): malformed or out-of-bounds ranges and malformed queueId return 400 INVALID_ARGUMENT', async () => {
    const bad = [
      '',
      '?to=2026-11-26',
      '?from=2026-11-20',
      '?from=2026-11-5&to=2026-11-26',
      '?from=2026-02-30&to=2026-03-01',
      '?from=2026-11-27&to=2026-11-26',
      '?from=2026-11-15&to=2026-12-16',
      '?from=2026-11-20&to=2026-11-26&foo=1',
      '?from=2026-11-20&from=2026-11-21&to=2026-11-26',
    ];
    for (const q of bad) {
      const res = await analytics(operator1, q);
      expect(res.status, q).toBe(400);
      expect(res.body.error.code, q).toBe('INVALID_ARGUMENT');
    }
    const malformedId = await analytics(operator1, RANGE, 'not-a-uuid');
    expect(malformedId.status).toBe(400);
    expect(malformedId.body.error.code).toBe('INVALID_ARGUMENT');

    const ok = await analytics(operator1, '?from=2026-11-15&to=2026-12-15');
    expect(ok.status).toBe(200);
    expect(ok.body.data.analytics.daily).toHaveLength(31);
  });

  it('ANALYTICS-007 (AC-60): 401 without session, 403 for customer and unassigned operator, 404 for unknown queue', async () => {
    const anon = await analytics(null, RANGE);
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHORIZED');

    const cust = await analytics(customer1, RANGE);
    expect(cust.status).toBe(403);
    expect(cust.body.error.code).toBe('FORBIDDEN');

    const unassigned = await analytics(operator2, RANGE);
    expect(unassigned.status).toBe(403);
    expect(unassigned.body.error.code).toBe('FORBIDDEN');

    const unknown = await analytics(operator1, RANGE, UNKNOWN_V4);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('ANALYTICS-008 (AC-60): reading the report changes no row', async () => {
    await insertDs11();
    const before = await snapshot();
    for (let i = 0; i < 3; i++) {
      expect((await analytics(operator1, RANGE)).status).toBe(200);
    }
    expect(await analytics(customer1, RANGE)).toHaveProperty('status', 403);
    expect(await snapshot()).toBe(before);
  });

  it('ANALYTICS-009 (AC-56, AC-57): a live F-05 lifecycle today adds exactly one wait and one service sample', async () => {
    await insertDs11();
    const today = bangkokToday();
    const q = `?from=${today}&to=${today}`;
    const base = (await analytics(operator1, q)).body.data.analytics;

    const joinRes = await request(app)
      .post(`/api/queues/${Q}/entries`)
      .set('Cookie', customer1.cookieHeader)
      .set('X-CSRF-Token', customer1.csrfToken)
      .send({});
    expect(joinRes.status).toBe(201);
    const entryId = joinRes.body.data.entry.id;

    const afterJoin = (await analytics(operator1, q)).body.data.analytics;
    expect(afterJoin.volumes.joined).toBe(base.volumes.joined + 1);
    expect(afterJoin.volumes.waiting).toBe(base.volumes.waiting + 1);
    expect(afterJoin.waitTime.count).toBe(base.waitTime.count);

    const call = await request(app)
      .post(`/api/operator/queues/${Q}/call-next`)
      .set('Cookie', operator1.cookieHeader)
      .set('X-CSRF-Token', operator1.csrfToken)
      .send({});
    expect(call.status).toBe(200);
    expect(call.body.data.entry.id).toBe(entryId);
    for (const action of ['start', 'complete']) {
      const r = await request(app)
        .post(`/api/operator/queue-entries/${entryId}/${action}`)
        .set('Cookie', operator1.cookieHeader)
        .set('X-CSRF-Token', operator1.csrfToken)
        .send({});
      expect(r.status, action).toBe(200);
    }

    const after = (await analytics(operator1, q)).body.data.analytics;
    expect(after.volumes.joined).toBe(base.volumes.joined + 1);
    expect(after.volumes.completed).toBe(base.volumes.completed + 1);
    expect(after.waitTime.count).toBe(base.waitTime.count + 1);
    expect(after.serviceTime.count).toBe(base.serviceTime.count + 1);

    const row = await prisma.queueEntry.findUniqueOrThrow({ where: { id: entryId } });
    const wait = Math.round(((row.calledAt!.getTime() - row.joinedAt.getTime()) / 1000) * 10) / 10;
    const service = Math.round(((row.completedAt!.getTime() - row.serviceStartedAt!.getTime()) / 1000) * 10) / 10;
    expect(after.waitTime.maxSeconds).toBe(wait);
    expect(after.serviceTime.maxSeconds).toBe(service);
  });
});
