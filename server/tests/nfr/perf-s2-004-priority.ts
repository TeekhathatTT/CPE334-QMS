/**
 * PERF-S2-004 / NFR-04 — F-10 priority queue policy reads and mutations on a seeded 1,000-entry dataset.
 * Same method as PERF-001 / PERF-S2-001 / PERF-S2-002 / PERF-S2-003 (sequential client-side wall time over TCP).
 *
 * Dataset: 1,000 WAITING entries in OPEN queue (800 earlier NORMAL + 200 later PRIORITY),
 *          seeded counters C1 and C2 OPEN.
 * Operations (docs/sprints/sprint-2/tests.md §9.1):
 *   1. PATCH /api/operator/queue-entries/:id/priority (6 warm-ups + 100 timed = 106 alternating toggles, ending NORMAL)
 *   2. POST /api/operator/counters/:id/call-next (priority-ordered, 5 warm-ups + 100 timed across C1/C2;
 *      verifies all 105 claims are PRIORITY ahead of older NORMAL entries and distinct)
 *   3. GET /api/operator/queues/:id/entries (WAITING-only priority sort across 1,000 rows, 5 warm-ups + 100 timed)
 *   4. GET /api/me/queue-entries/:id (priority-aware aheadCount for a NORMAL WAITING entry, 5 warm-ups + 100 timed)
 *
 * Run: npm run test:perf:f10 --workspace=server
 * Writes docs/sprints/sprint-2/evidence/perf-s2-004.txt
 */
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { performance } from 'perf_hooks';
import { HttpUser, SERVER_DIR, hostInfo, setupTestEnv } from './common';

const env = setupTestEnv();
const WARMUP = 5;
const TOGGLE_WARMUP = 6; // Even total: 6 warm-ups + 100 timed = 106 alternating toggles, ending NORMAL.
const RUNS = 100;
const DATASET = 1000;
const NORMAL_COUNT = 800;
const PRIORITY_COUNT = DATASET - NORMAL_COUNT; // 200
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

  // ---- dataset: 800 earlier NORMAL + 200 later PRIORITY (all WAITING) ----
  await resetAndSeed();
  const hash = await hashPassword(PASSWORD);
  await prisma.user.createMany({
    data: Array.from({ length: DATASET }, (_, i) => ({
      email: `perf-f10-c-${i}@example.com`,
      passwordHash: hash,
      role: 'CUSTOMER' as const,
      accountStatus: 'ACTIVE' as const,
    })),
  });
  const datasetUsers = await prisma.user.findMany({
    where: { email: { startsWith: 'perf-f10-c-' } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(datasetUsers.map((u) => [u.email, u.id]));
  const base = Date.parse('2026-11-28T00:00:00.000Z');
  await prisma.queueEntry.createMany({
    data: Array.from({ length: DATASET }, (_, i) => ({
      customerId: byEmail.get(`perf-f10-c-${i}@example.com`)!,
      serviceQueueId: OPEN_QUEUE_ID,
      queueNumber: BigInt(i + 1),
      status: 'WAITING' as const,
      priority: i < NORMAL_COUNT ? ('NORMAL' as const) : ('PRIORITY' as const),
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
    const toggleTarget = await prisma.queueEntry.findFirstOrThrow({ where: { queueNumber: BigInt(1) } });
    const observedNormalCustomer = await HttpUser.login(url, 'perf-f10-c-50@example.com', PASSWORD);
    const observedNormalEntry = await prisma.queueEntry.findFirstOrThrow({ where: { queueNumber: BigInt(51) } });

    // 1. PATCH entry priority (6 warm-ups + 100 timed = 106 alternating toggles: PRIORITY, NORMAL, ..., NORMAL)
    results.push(
      await measure(
        'PATCH /api/operator/queue-entries/:id/priority',
        'mutation',
        TOGGLE_WARMUP,
        async (i) => {
          const nextPriority = i % 2 === 0 ? 'PRIORITY' : 'NORMAL';
          const r = await patchJson(op, `/api/operator/queue-entries/${toggleTarget.id}/priority`, {
            priority: nextPriority,
          });
          if (r.status === 200 && r.body.data.entry.priority !== nextPriority) {
            throw new Error(`expected priority ${nextPriority}, got ${r.body.data.entry.priority}`);
          }
          return r;
        },
        [200]
      )
    );

    // 2. Priority-ordered POST counter Call Next (5 warm-ups + 100 timed across C1/C2)
    // All 105 claims must come from the 200 later PRIORITY entries (queueNumber 801..905), never NORMAL.
    results.push(
      await measure(
        'POST /api/operator/counters/:id/call-next (priority)',
        'mutation',
        WARMUP,
        async (i) => {
          const cid = i % 2 === 0 ? COUNTER_1_ID : COUNTER_2_ID;
          const r = await op.post(`/api/operator/counters/${cid}/call-next`);
          if (r.status === 200) {
            const entry = r.body.data.entry;
            if (entry.priority !== 'PRIORITY') {
              throw new Error(`expected PRIORITY claim before NORMAL, got ${entry.priority} (#${entry.queueNumber})`);
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
      throw new Error(`expected ${WARMUP + RUNS} distinct PRIORITY claims, got ${claimedIds.size}`);
    }

    const remainingPriority = PRIORITY_COUNT - (WARMUP + RUNS); // 95

    // 3. GET operator entries list (1,000 rows, WAITING-only priority sort)
    results.push(
      await measure(
        'GET /api/operator/queues/:id/entries (priority sort)',
        'read',
        WARMUP,
        async () => {
          const r = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
          const entries = r.body.data.entries as Array<{ status: string; priority: string }>;
          if (entries.length !== DATASET) throw new Error(`list has ${entries.length} rows`);
          const waiting = entries.filter((e) => e.status === 'WAITING');
          if (waiting.length !== DATASET - (WARMUP + RUNS)) {
            throw new Error(`expected ${DATASET - (WARMUP + RUNS)} WAITING entries, got ${waiting.length}`);
          }
          // First remainingPriority WAITING entries must all be PRIORITY, followed by NORMAL.
          for (let k = 0; k < remainingPriority; k++) {
            if (waiting[k].priority !== 'PRIORITY') {
              throw new Error(`WAITING index ${k} was ${waiting[k].priority}, expected PRIORITY`);
            }
          }
          if (waiting[remainingPriority].priority !== 'NORMAL') {
            throw new Error(`WAITING index ${remainingPriority} was ${waiting[remainingPriority].priority}, expected NORMAL`);
          }
          return r;
        },
        [200]
      )
    );

    // 4. GET customer entry detail (priority-aware aheadCount for NORMAL #51: 95 PRIORITY + 50 earlier NORMAL = 145)
    const expectedAhead = remainingPriority + 50;
    results.push(
      await measure(
        'GET /api/me/queue-entries/:id (priority aheadCount)',
        'read',
        WARMUP,
        async () => {
          const r = await observedNormalCustomer.get(`/api/me/queue-entries/${observedNormalEntry.id}`);
          if (r.body.data.entry.aheadCount !== expectedAhead) {
            throw new Error(`expected aheadCount ${expectedAhead}, got ${r.body.data.entry.aheadCount}`);
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
    `PERF-S2-004 / NFR-04 run (F-10): ${new Date().toISOString()}`,
    `Command: npm run test:perf:f10 --workspace=server   (tsx tests/nfr/perf-s2-004-priority.ts)`,
    `Host: ${hostInfo()}`,
    `Database: ${pg[0].version.split(',')[0]}, test database "${env.testDbName}" on ${env.testDbHost}:${env.testDbPort}`,
    `Method: same as PERF-001. Real Express app on a local ephemeral port, sequential HTTP requests (Node fetch,`,
    `        real cookies + CSRF), ${WARMUP} untimed warm-ups (${TOGGLE_WARMUP} for Step 1 even toggle count) then ${RUNS} timed requests per operation.`,
    `Dataset: ${datasetCount} WAITING entries in the OPEN queue (${NORMAL_COUNT} earlier NORMAL + ${PRIORITY_COUNT} later PRIORITY, 2 OPEN counters).`,
    `         Step 1 ran ${TOGGLE_WARMUP + RUNS} alternating toggles ending NORMAL; Step 2 claimed ${claimedIds.size} distinct PRIORITY entries ahead of NORMAL.`,
    `Targets: read p95 <= ${READ_P95_MS} ms, mutation p95 <= ${MUTATION_P95_MS} ms.`,
    '',
    `${'Operation'.padEnd(56)} ${'kind'.padEnd(9)} ${'n'.padStart(4)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'max ms'.padStart(8)} target  result`,
    ...results.map(
      (r) =>
        `${r.name.padEnd(56)} ${r.kind.padEnd(9)} ${String(r.n).padStart(4)} ${fmt(r.p50)} ${fmt(r.p95)} ${fmt(r.max)} ${String(r.target).padStart(6)}  ${r.pass ? 'PASS' : 'FAIL'}`
    ),
    '',
    `Overall: ${allPass ? 'PASSED' : 'FAILED'}`,
  ];
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, 'perf-s2-004.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nWritten: ${file}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
