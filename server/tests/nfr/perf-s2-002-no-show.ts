/**
 * PERF-S2-002 / NFR-04 — F-08 no-show and recover mutations and the reads F-08 affects, on a seeded
 * 1,000-entry dataset. Same method as PERF-001 (server/tests/nfr/perf-001.ts), which is unchanged.
 *
 * - The real Express app listens on an ephemeral port; requests go over real TCP with Node fetch,
 *   real session cookies and CSRF tokens. Requests are sequential (latency, not throughput).
 * - Each operation gets 5 untimed warm-ups, then 100 timed requests. Time is measured on the
 *   client from send until the full body is read. Targets: read p95 <= 500 ms, mutation p95 <= 1,000 ms.
 * - Dataset: 1,000 WAITING entries (1,000 distinct customers) in the OPEN queue before timing.
 * - Setup (untimed): operator1 calls next 105 times, so the 105 oldest entries are CALLED.
 * - Operations, in order:
 *   1. POST /api/operator/queue-entries/:id/no-show on the 105 CALLED entries.
 *   2. GET /api/operator/queues/:id/entries: 1,000 rows, 105 of them NO_SHOW.
 *   3. GET /api/me/queue-entries/:id: aheadCount for the last entry with 105 NO_SHOW rows ahead.
 *   4. POST /api/operator/queue-entries/:id/recover on the same 105 entries (queue-row lock + entry lock).
 *
 * Run: npm run test:perf:f08 --workspace=server
 * Writes docs/sprints/sprint-2/evidence/perf-s2-002.txt (does not touch Sprint 1 evidence).
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
  const N = WARMUP + RUNS;

  // ---- server ----
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const results: Result[] = [];
  let noShowRows = 0;
  let waitingAfter = 0;
  try {
    const op = await HttpUser.login(url, 'operator1@example.com', PASSWORD);
    const lastCustomer = await HttpUser.login(url, `perf-c-${DATASET - 1}@example.com`, PASSWORD);
    const lastEntry = await prisma.queueEntry.findFirstOrThrow({ where: { queueNumber: BigInt(DATASET) } });

    // Setup (untimed): call the 105 oldest entries.
    const called: string[] = [];
    for (let i = 0; i < N; i++) {
      const r = await op.post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
      if (r.status !== 200) throw new Error(`setup call-next ${i} returned ${r.status}`);
      called.push(r.body.data.entry.id);
    }

    // 1. Mark no-show
    results.push(
      await measure('POST /api/operator/queue-entries/:id/no-show', 'mutation', async (i) => {
        const r = await op.post(`/api/operator/queue-entries/${called[i]}/no-show`);
        if (r.status === 200 && (r.body.data.entry.status !== 'NO_SHOW' || r.body.data.entry.noShowCount !== 1)) {
          throw new Error('entry not NO_SHOW with count 1');
        }
        return r;
      }, [200])
    );
    noShowRows = await prisma.queueEntry.count({ where: { status: 'NO_SHOW' } });
    if (noShowRows !== N) throw new Error(`expected ${N} NO_SHOW rows, found ${noShowRows}`);

    // 2. Operator list with NO_SHOW rows
    results.push(
      await measure('GET /api/operator/queues/:id/entries (105 NO_SHOW included)', 'read', async () => {
        const r = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
        const entries = r.body.data.entries as Array<{ status: string }>;
        if (entries.length !== DATASET) throw new Error(`list has ${entries.length} rows`);
        if (entries.filter((e) => e.status === 'NO_SHOW').length !== N) throw new Error('NO_SHOW rows missing from list');
        return r;
      }, [200])
    );

    // 3. Own entry detail with NO_SHOW rows ahead
    results.push(
      await measure('GET /api/me/queue-entries/:id (105 NO_SHOW ahead)', 'read', async () => {
        const r = await lastCustomer.get(`/api/me/queue-entries/${lastEntry.id}`);
        if (r.body.data.entry.aheadCount !== DATASET - 1 - N) throw new Error(`aheadCount ${r.body.data.entry.aheadCount}`);
        return r;
      }, [200])
    );

    // 4. Return to queue
    results.push(
      await measure('POST /api/operator/queue-entries/:id/recover', 'mutation', async (i) => {
        const r = await op.post(`/api/operator/queue-entries/${called[i]}/recover`);
        if (r.status === 200 && (r.body.data.entry.status !== 'WAITING' || r.body.data.entry.calledAt !== null)) {
          throw new Error('returned entry not WAITING with calledAt null');
        }
        return r;
      }, [200])
    );
    waitingAfter = await prisma.queueEntry.count({ where: { status: 'WAITING' } });
    if (waitingAfter !== DATASET) throw new Error(`expected ${DATASET} WAITING rows after the returns, found ${waitingAfter}`);
  } finally {
    await new Promise((r) => server.close(r));
  }

  const pg = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() AS version`;
  await prisma.$disconnect();

  const fmt = (n: number) => n.toFixed(1).padStart(8);
  const allPass = results.every((r) => r.pass);
  const lines = [
    `PERF-S2-002 / NFR-04 run (F-08): ${new Date().toISOString()}`,
    `Command: npm run test:perf:f08 --workspace=server   (tsx tests/nfr/perf-s2-002-no-show.ts)`,
    `Host: ${hostInfo()}`,
    `Database: ${pg[0].version.split(',')[0]}, test database "${env.testDbName}" on ${env.testDbHost}:${env.testDbPort}`,
    `Method: same as PERF-001. Real Express app on a local ephemeral port, sequential HTTP requests (Node fetch,`,
    `        real cookies + CSRF), ${WARMUP} untimed warm-ups then ${RUNS} timed requests per operation, client-side wall time incl. body.`,
    `Dataset: ${datasetCount} queue entries before timing (${DATASET} WAITING in the OPEN queue). Setup (untimed): ${N} Call Next.`,
    `         ${noShowRows} entries marked NO_SHOW, then the same ${N} returned to the queue; ${waitingAfter} WAITING at the end.`,
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
  const file = path.join(EVIDENCE_DIR, 'perf-s2-002.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nWritten: ${file}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
