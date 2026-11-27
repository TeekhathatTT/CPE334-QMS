/**
 * PERF-S2-003 / NFR-04 — F-09 multi-counter reads and mutations on a seeded 1,000-entry dataset.
 * Same method as PERF-001 / PERF-S2-001 / PERF-S2-002 (sequential client-side wall time over TCP).
 *
 * Operations (docs/sprints/sprint-2/tests.md §8.1, Blocking #2 fix):
 *   1. GET /api/operator/queues/:id/counters (5 warm-ups + 100 timed)
 *   2. PATCH /api/operator/counters/:id/status alternating CLOSED/OPEN for an EVEN total
 *      (6 warm-ups + 100 timed = 106 alternating toggles, ending OPEN)
 *   -- Precondition check/reset asserting both C1 and C2 are OPEN before Step 3 --
 *   3. POST /api/operator/counters/:id/call-next (5 warm-ups + 100 timed across C1/C2; every call 200)
 *   4. GET /api/operator/queues/:id/entries (with counter join, 5 warm-ups + 100 timed)
 *   5. GET /api/me/queue-entries/:id (called entry with counterName, 5 warm-ups + 100 timed)
 *
 * Run: npm run test:perf:f09 --workspace=server
 * Writes docs/sprints/sprint-2/evidence/perf-s2-003.txt
 */
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { performance } from 'perf_hooks';
import { HttpUser, SERVER_DIR, hostInfo, setupTestEnv } from './common';

const env = setupTestEnv();
const WARMUP = 5;
const TOGGLE_WARMUP = 6; // Even total: 6 warm-ups + 100 timed = 106 alternating toggles, ending OPEN.
const RUNS = 100;
const DATASET = 1000;
const READ_P95_MS = 500;
const MUTATION_P95_MS = 1000;
const PASSWORD = 'Password123!';
const OPEN_QUEUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COUNTER_1_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const COUNTER_2_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const EVIDENCE_DIR = path.resolve(SERVER_DIR, '..', 'docs', 'sprints', 'sprint-2', 'evidence');

interface Result {
  name: string;
  kind: 'read' | 'mutation';
  n: number;
  p50: number;
  p95: number;
  max: number;
  target: number;
  pass: boolean;
}

function pct(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

async function measure(
  name: string,
  kind: 'read' | 'mutation',
  warmup: number,
  op: (i: number) => Promise<{ status: number }>,
  expected: number[]
): Promise<Result> {
  const times: number[] = [];
  for (let i = 0; i < warmup + RUNS; i++) {
    const t0 = performance.now();
    const res = await op(i);
    const dt = performance.now() - t0;
    if (!expected.includes(res.status)) throw new Error(`${name} request ${i} returned ${res.status}`);
    if (i >= warmup) times.push(dt);
  }
  times.sort((a, b) => a - b);
  const target = kind === 'read' ? READ_P95_MS : MUTATION_P95_MS;
  const p95 = pct(times, 0.95);
  return {
    name,
    kind,
    n: times.length,
    p50: pct(times, 0.5),
    p95,
    max: times[times.length - 1],
    target,
    pass: p95 <= target,
  };
}

async function patchJson(
  user: HttpUser,
  p: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${user.base}${p}`, {
    method: 'PATCH',
    headers: {
      Cookie: user.cookie,
      'X-CSRF-Token': user.csrf,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function main(): Promise<void> {
  const { app } = await import('../../src/app');
  const { prisma } = await import('../../src/db');
  const { resetAndSeed } = await import('../helpers/auth');
  const { hashPassword } = await import('../../src/auth/password');

  // ---- dataset ----
  await resetAndSeed();
  const hash = await hashPassword(PASSWORD);
  await prisma.user.createMany({
    data: Array.from({ length: DATASET }, (_, i) => ({
      email: `perf-c-${i}@example.com`,
      passwordHash: hash,
      role: 'CUSTOMER' as const,
      accountStatus: 'ACTIVE' as const,
    })),
  });
  const datasetUsers = await prisma.user.findMany({
    where: { email: { startsWith: 'perf-c-' } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(datasetUsers.map((u) => [u.email, u.id]));
  const base = Date.parse('2026-11-27T00:00:00.000Z');
  await prisma.queueEntry.createMany({
    data: Array.from({ length: DATASET }, (_, i) => ({
      customerId: byEmail.get(`perf-c-${i}@example.com`)!,
      serviceQueueId: OPEN_QUEUE_ID,
      queueNumber: BigInt(i + 1),
      status: 'WAITING' as const,
      joinedAt: new Date(base + i * 1000),
    })),
  });
  await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { lastQueueNumber: BigInt(DATASET) } });
  const datasetCount = await prisma.queueEntry.count();

  // ---- server ----
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const results: Result[] = [];
  const claimedIds = new Set<string>();
  try {
    const op = await HttpUser.login(url, 'operator1@example.com', PASSWORD);
    const firstCustomer = await HttpUser.login(url, 'perf-c-0@example.com', PASSWORD);
    const firstEntry = await prisma.queueEntry.findFirstOrThrow({ where: { queueNumber: BigInt(1) } });

    // 1. GET queue counters
    results.push(
      await measure(
        'GET /api/operator/queues/:id/counters',
        'read',
        WARMUP,
        async () => {
          const r = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/counters`);
          if (r.status === 200 && r.body.data.counters.length !== 2) {
            throw new Error(`expected 2 counters, got ${r.body.data.counters.length}`);
          }
          return r;
        },
        [200]
      )
    );

    // 2. PATCH counter status (even 6 + 100 = 106 alternating toggles: CLOSED, OPEN, ..., OPEN)
    results.push(
      await measure(
        'PATCH /api/operator/counters/:id/status',
        'mutation',
        TOGGLE_WARMUP,
        async (i) => {
          const nextStatus = i % 2 === 0 ? 'CLOSED' : 'OPEN';
          const r = await patchJson(op, `/api/operator/counters/${COUNTER_1_ID}/status`, { status: nextStatus });
          if (r.status === 200 && r.body.data.counter.status !== nextStatus) {
            throw new Error(`expected status ${nextStatus}, got ${r.body.data.counter.status}`);
          }
          return r;
        },
        [200]
      )
    );

    // Explicit precondition check / reset verifying both C1 and C2 are OPEN before Step 3 (Blocking #2).
    const preCheck = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/counters`);
    if (preCheck.status !== 200) throw new Error(`precondition counter check returned ${preCheck.status}`);
    for (const c of preCheck.body.data.counters as Array<{ id: string; status: string }>) {
      if (c.status !== 'OPEN') {
        throw new Error(`precondition failed: counter ${c.id} was ${c.status} before Step 3`);
      }
    }

    // 3. POST counter Call Next (5 warm-ups + 100 timed across C1 and C2; every call returns 200)
    results.push(
      await measure(
        'POST /api/operator/counters/:id/call-next',
        'mutation',
        WARMUP,
        async (i) => {
          const cid = i % 2 === 0 ? COUNTER_1_ID : COUNTER_2_ID;
          const expectedName = i % 2 === 0 ? 'Counter 1' : 'Counter 2';
          const r = await op.post(`/api/operator/counters/${cid}/call-next`);
          if (r.status === 200) {
            const entry = r.body.data.entry;
            if (entry.counterId !== cid || entry.counterName !== expectedName) {
              throw new Error(`counter mismatch: expected ${cid}/${expectedName}, got ${entry.counterId}/${entry.counterName}`);
            }
            if (claimedIds.has(entry.id)) {
              throw new Error(`duplicate claim detected for entry ${entry.id}`);
            }
            claimedIds.add(entry.id);
          }
          return r;
        },
        [200]
      )
    );
    if (claimedIds.size !== WARMUP + RUNS) {
      throw new Error(`expected ${WARMUP + RUNS} distinct claims, got ${claimedIds.size}`);
    }

    // 4. GET operator entries list (1,000 rows with counter join)
    results.push(
      await measure(
        'GET /api/operator/queues/:id/entries (with counter join)',
        'read',
        WARMUP,
        async () => {
          const r = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
          const entries = r.body.data.entries as Array<{ status: string; counterName: string | null }>;
          if (entries.length !== DATASET) throw new Error(`list has ${entries.length} rows`);
          if (entries.filter((e) => e.status === 'CALLED' && e.counterName !== null).length !== WARMUP + RUNS) {
            throw new Error('called entries missing counterName');
          }
          return r;
        },
        [200]
      )
    );

    // 5. GET customer entry detail (called entry with counterName)
    results.push(
      await measure(
        'GET /api/me/queue-entries/:id (called with counterName)',
        'read',
        WARMUP,
        async () => {
          const r = await firstCustomer.get(`/api/me/queue-entries/${firstEntry.id}`);
          if (r.body.data.entry.counterName !== 'Counter 1') {
            throw new Error(`expected Counter 1, got ${r.body.data.entry.counterName}`);
          }
          return r;
        },
        [200]
      )
    );
  } finally {
    await new Promise((r) => server.close(r));
  }

  const pg = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() AS version`;
  await prisma.$disconnect();

  const fmt = (n: number) => n.toFixed(1).padStart(8);
  const allPass = results.every((r) => r.pass);
  const lines = [
    `PERF-S2-003 / NFR-04 run (F-09): ${new Date().toISOString()}`,
    `Command: npm run test:perf:f09 --workspace=server   (tsx tests/nfr/perf-s2-003-multi-counter.ts)`,
    `Host: ${hostInfo()}`,
    `Database: ${pg[0].version.split(',')[0]}, test database "${env.testDbName}" on ${env.testDbHost}:${env.testDbPort}`,
    `Method: same as PERF-001. Real Express app on a local ephemeral port, sequential HTTP requests (Node fetch,`,
    `        real cookies + CSRF), ${WARMUP} untimed warm-ups (${TOGGLE_WARMUP} for Step 2 even toggle count) then ${RUNS} timed requests per operation.`,
    `Dataset: ${datasetCount} queue entries before timing (${DATASET} WAITING in the OPEN queue, 2 OPEN counters).`,
    `         Step 2 ran ${TOGGLE_WARMUP + RUNS} alternating toggles ending OPEN (verified before Step 3); Step 3 claimed ${claimedIds.size} distinct entries.`,
    `Targets: read p95 <= ${READ_P95_MS} ms, mutation p95 <= ${MUTATION_P95_MS} ms.`,
    '',
    `${'Operation'.padEnd(58)} ${'kind'.padEnd(9)} ${'n'.padStart(4)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'max ms'.padStart(8)} target  result`,
    ...results.map(
      (r) =>
        `${r.name.padEnd(58)} ${r.kind.padEnd(9)} ${String(r.n).padStart(4)} ${fmt(r.p50)} ${fmt(r.p95)} ${fmt(r.max)} ${String(r.target).padStart(6)}  ${r.pass ? 'PASS' : 'FAIL'}`
    ),
    '',
    `Overall: ${allPass ? 'PASSED' : 'FAILED'}`,
  ];
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, 'perf-s2-003.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nWritten: ${file}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
