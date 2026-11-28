/**
 * PERF-S2-001 / NFR-04 — F-07 cancel mutation and the operations F-07 changed, on a seeded
 * 1,000-entry dataset. Same method as PERF-001 (server/tests/nfr/perf-001.ts), which is unchanged.
 *
 * - The real Express app listens on an ephemeral port; requests go over real TCP with Node fetch,
 *   real session cookies and CSRF tokens. Requests are sequential (latency, not throughput).
 * - Each operation gets 5 untimed warm-ups, then 100 timed requests. Time is measured on the
 *   client from send until the full body is read. Targets: read p95 <= 500 ms, mutation p95 <= 1,000 ms.
 * - Dataset: 1,000 WAITING entries (1,000 distinct customers) in the OPEN queue before timing.
 * - Operations, in order:
 *   1. POST /api/me/queue-entries/:id/cancel: 105 different dataset customers each cancel their own
 *      WAITING entry (entries spread through the queue, so cancelled rows sit ahead of WAITING ones).
 *   2. GET /api/operator/queues/:id/entries: list now filters out CANCELLED (>= 895 rows returned).
 *   3. GET /api/me/queue-entries/:id: aheadCount for the last entry with 105 cancelled rows ahead.
 *   4. POST /api/queues/:id/entries: the same 105 customers rejoin after cancelling (BR-05 revision).
 *   5. POST /api/operator/queues/:id/call-next: Call Next with CANCELLED rows ahead in FIFO order.
 *
 * Run: npm run test:perf:f07 --workspace=server
 * Writes docs/sprints/sprint-2/evidence/perf-s2-001.txt (does not touch Sprint 1 evidence).
 */
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { performance } from 'perf_hooks';
import { HttpUser, SERVER_DIR, hostInfo, setupTestEnv } from './common';

const env = setupTestEnv();
const WARMUP = 5;
const RUNS = 100;
const DATASET = 1000;
const READ_P95_MS = 500;
const MUTATION_P95_MS = 1000;
const PASSWORD = 'Password123!';
const OPEN_QUEUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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
  op: (i: number) => Promise<{ status: number }>,
  expected: number[]
): Promise<Result> {
  const times: number[] = [];
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const t0 = performance.now();
    const res = await op(i);
    const dt = performance.now() - t0;
    if (!expected.includes(res.status)) throw new Error(`${name} request ${i} returned ${res.status}`);
    if (i >= WARMUP) times.push(dt);
  }
  times.sort((a, b) => a - b);
  const target = kind === 'read' ? READ_P95_MS : MUTATION_P95_MS;
  const p95 = pct(times, 0.95);
  return { name, kind, n: times.length, p50: pct(times, 0.5), p95, max: times[times.length - 1], target, pass: p95 <= target };
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

  // The 105 cancellers are spread through the first 945 positions (every 9th entry), so every
  // cancelled row is ahead of the last WAITING entry and ahead of most of the queue.
  const cancellerIdx = Array.from({ length: WARMUP + RUNS }, (_, i) => i * 9);
  const cancellerEntries = await prisma.queueEntry.findMany({
    where: { queueNumber: { in: cancellerIdx.map((i) => BigInt(i + 1)) } },
    select: { id: true, queueNumber: true },
  });
  const entryByNumber = new Map(cancellerEntries.map((e) => [Number(e.queueNumber), e.id]));

  // ---- server ----
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const results: Result[] = [];
  let cancelledAfter = 0;
  let firstCalledNumber = '';
  try {
    // Logins are setup here (PERF-001 already measures login), so they are not timed.
    const cancellers: HttpUser[] = [];
    for (const i of cancellerIdx) cancellers.push(await HttpUser.login(url, `perf-c-${i}@example.com`, PASSWORD));
    const lastCustomer = await HttpUser.login(url, `perf-c-${DATASET - 1}@example.com`, PASSWORD);
    const lastEntry = await prisma.queueEntry.findFirstOrThrow({ where: { queueNumber: BigInt(DATASET) } });
    const op = await HttpUser.login(url, 'operator1@example.com', PASSWORD);

    // 1. Cancel (the new F-07 mutation)
    results.push(
      await measure('POST /api/me/queue-entries/:id/cancel', 'mutation', async (i) => {
        const r = await cancellers[i].post(`/api/me/queue-entries/${entryByNumber.get(cancellerIdx[i] + 1)}/cancel`);
        if (r.status === 200 && r.body.data.entry.status !== 'CANCELLED') throw new Error('entry not CANCELLED');
        return r;
      }, [200])
    );
    cancelledAfter = await prisma.queueEntry.count({ where: { status: 'CANCELLED' } });
    if (cancelledAfter !== WARMUP + RUNS) throw new Error(`expected ${WARMUP + RUNS} CANCELLED rows, found ${cancelledAfter}`);

    // 2. Operator list, now filtering CANCELLED
    results.push(
      await measure('GET /api/operator/queues/:id/entries (CANCELLED filtered)', 'read', async () => {
        const r = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
        const entries = r.body.data.entries as Array<{ status: string }>;
        if (entries.length !== DATASET - cancelledAfter) throw new Error(`list has ${entries.length} rows`);
        if (entries.some((e) => e.status === 'CANCELLED')) throw new Error('CANCELLED entry in operator list');
        return r;
      }, [200])
    );

    // 3. Own entry detail with cancelled rows ahead
    results.push(
      await measure('GET /api/me/queue-entries/:id (105 CANCELLED ahead)', 'read', async () => {
        const r = await lastCustomer.get(`/api/me/queue-entries/${lastEntry.id}`);
        if (r.body.data.entry.aheadCount !== DATASET - 1 - cancelledAfter) {
          throw new Error(`aheadCount ${r.body.data.entry.aheadCount}`);
        }
        return r;
      }, [200])
    );

    // 4. Rejoin after cancel
    results.push(
      await measure('POST /api/queues/:id/entries (rejoin after cancel)', 'mutation', async (i) => {
        const r = await cancellers[i].post(`/api/queues/${OPEN_QUEUE_ID}/entries`);
        if (r.status === 201 && Number(r.body.data.entry.queueNumber) <= DATASET) throw new Error('rejoin number not larger');
        return r;
      }, [201])
    );

    // 5. Call Next with CANCELLED rows ahead in FIFO order
    results.push(
      await measure('POST /api/operator/queues/:id/call-next (CANCELLED ahead)', 'mutation', async (i) => {
        const r = await op.post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
        if (r.status === 200) {
          if (r.body.data.entry.status !== 'CALLED') throw new Error('called entry not CALLED');
          if (i === 0) firstCalledNumber = String(r.body.data.entry.queueNumber);
        }
        return r;
      }, [200])
    );
    if (firstCalledNumber !== '2') throw new Error(`first Call Next took number ${firstCalledNumber}, expected 2 (1 is cancelled)`);
  } finally {
    await new Promise((r) => server.close(r));
  }

  const finalCount = await prisma.queueEntry.count();
  const calledCancelled = await prisma.queueEntry.count({ where: { status: 'CANCELLED', calledAt: { not: null } } });
  const pg = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() AS version`;
  await prisma.$disconnect();
  if (calledCancelled !== 0) throw new Error(`${calledCancelled} CANCELLED entries have calledAt set`);

  const fmt = (n: number) => n.toFixed(1).padStart(8);
  const allPass = results.every((r) => r.pass);
  const lines = [
    `PERF-S2-001 / NFR-04 run (F-07): ${new Date().toISOString()}`,
    `Command: npm run test:perf:f07 --workspace=server   (tsx tests/nfr/perf-s2-001-cancel.ts)`,
    `Host: ${hostInfo()}`,
    `Database: ${pg[0].version.split(',')[0]}, test database "${env.testDbName}" on ${env.testDbHost}:${env.testDbPort}`,
    `Method: same as PERF-001. Real Express app on a local ephemeral port, sequential HTTP requests (Node fetch,`,
    `        real cookies + CSRF), ${WARMUP} untimed warm-ups then ${RUNS} timed requests per operation, client-side wall time incl. body.`,
    `Dataset: ${datasetCount} queue entries before timing (${DATASET} WAITING in the OPEN queue); ${cancelledAfter} cancelled during the run`,
    `         (every 9th entry, numbers 1..937); ${finalCount} entries after. No CANCELLED entry was ever called.`,
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
  const file = path.join(EVIDENCE_DIR, 'perf-s2-001.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nWritten: ${file}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
