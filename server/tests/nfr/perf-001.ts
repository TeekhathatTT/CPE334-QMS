/**
 * PERF-001 / NFR-04 — local performance targets on a seeded 1,000-entry dataset.
 *
 * Method (traceability.md NFR-04): 100 timed requests per operation against the local test
 * database; p95 must be <= 500 ms for reads and <= 1,000 ms for mutations.
 * - The real Express app listens on an ephemeral port; requests go over real TCP with Node fetch,
 *   real session cookies and CSRF tokens. Requests are sequential (latency, not throughput).
 * - Each operation gets 5 untimed warm-up requests, then 100 timed ones. Time is measured on the
 *   client from send until the full body is read.
 * - Dataset: 1,000 WAITING entries (1,000 distinct customers) in the OPEN queue before timing; it
 *   only grows during the run.
 *
 * Run: npm run test:perf --workspace=server   (writes docs/sprints/sprint-1/evidence/perf-001.txt)
 */
import type { AddressInfo } from 'net';
import { performance } from 'perf_hooks';
import { HttpUser, hostInfo, setupTestEnv, writeEvidence } from './common';

const env = setupTestEnv();
const WARMUP = 5;
const RUNS = 100;
const DATASET = 1000;
const READ_P95_MS = 500;
const MUTATION_P95_MS = 1000;
const PASSWORD = 'Password123!';
const OPEN_QUEUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
  const joiners = WARMUP + RUNS;
  await prisma.user.createMany({
    data: [
      ...Array.from({ length: DATASET }, (_, i) => ({ email: `perf-c-${i}@example.com` })),
      ...Array.from({ length: joiners }, (_, i) => ({ email: `perf-join-${i}@example.com` })),
    ].map((u) => ({ ...u, passwordHash: hash, role: 'CUSTOMER' as const, accountStatus: 'ACTIVE' as const })),
  });
  const datasetUsers = await prisma.user.findMany({
    where: { email: { startsWith: 'perf-c-' } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(datasetUsers.map((u) => [u.email, u.id]));
  const base = Date.parse('2026-11-14T00:00:00.000Z');
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
  try {
    // Logins of the joiners are themselves timed (session creation is a write).
    const joinUsers: HttpUser[] = [];
    results.push(
      await measure('POST /api/auth/login', 'mutation', async (i) => {
        const u = await HttpUser.login(url, `perf-join-${i}@example.com`, PASSWORD);
        joinUsers.push(u);
        return { status: 200 };
      }, [200])
    );

    const lastCustomer = await HttpUser.login(url, `perf-c-${DATASET - 1}@example.com`, PASSWORD);
    const lastEntry = await prisma.queueEntry.findFirstOrThrow({ where: { queueNumber: BigInt(DATASET) } });
    const op = await HttpUser.login(url, 'operator1@example.com', PASSWORD);

    // Reads
    results.push(await measure('GET /api/auth/me', 'read', () => lastCustomer.get('/api/auth/me'), [200]));
    results.push(await measure('GET /api/queues', 'read', () => lastCustomer.get('/api/queues'), [200]));
    results.push(await measure('GET /api/me/queue-entries', 'read', () => lastCustomer.get('/api/me/queue-entries'), [200]));
    results.push(
      await measure('GET /api/me/queue-entries/:id (aheadCount over 1,000)', 'read', async () => {
        const r = await lastCustomer.get(`/api/me/queue-entries/${lastEntry.id}`);
        if (r.body.data.entry.aheadCount < DATASET - 1) throw new Error('aheadCount lower than expected');
        return r;
      }, [200])
    );
    results.push(await measure('GET /api/operator/queues', 'read', () => op.get('/api/operator/queues'), [200]));
    results.push(
      await measure('GET /api/operator/queues/:id/entries (>= 1,000 rows)', 'read', async () => {
        const r = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
        if (r.body.data.entries.length < DATASET) throw new Error('entries list shorter than dataset');
        return r;
      }, [200])
    );

    // Mutations
    results.push(
      await measure('POST /api/queues/:id/entries (join)', 'mutation', (i) => joinUsers[i].post(`/api/queues/${OPEN_QUEUE_ID}/entries`), [201])
    );
    const called: string[] = [];
    results.push(
      await measure('POST /api/operator/queues/:id/call-next', 'mutation', async () => {
        const r = await op.post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`);
        called.push(r.body.data.entry.id);
        return r;
      }, [200])
    );
    results.push(
      await measure('POST /api/operator/queue-entries/:id/start', 'mutation', (i) => op.post(`/api/operator/queue-entries/${called[i]}/start`), [200])
    );
    results.push(
      await measure('POST /api/operator/queue-entries/:id/complete', 'mutation', (i) => op.post(`/api/operator/queue-entries/${called[i]}/complete`), [200])
    );
  } finally {
    await new Promise((r) => server.close(r));
  }

  const finalCount = await prisma.queueEntry.count();
  const pg = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() AS version`;
  await prisma.$disconnect();

  const fmt = (n: number) => n.toFixed(1).padStart(8);
  const allPass = results.every((r) => r.pass);
  const lines = [
    `PERF-001 / NFR-04 run: ${new Date().toISOString()}`,
    `Command: npm run test:perf --workspace=server   (tsx tests/nfr/perf-001.ts)`,
    `Host: ${hostInfo()}`,
    `Database: ${pg[0].version.split(',')[0]}, test database "${env.testDbName}" on ${env.testDbHost}:${env.testDbPort}`,
    `Method: real Express app on a local ephemeral port, sequential HTTP requests (Node fetch, real cookies + CSRF),`,
    `        ${WARMUP} untimed warm-ups then ${RUNS} timed requests per operation, client-side wall time incl. body.`,
    `Dataset: ${datasetCount} queue entries before timing (${DATASET} WAITING in the OPEN queue), ${finalCount} after.`,
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
  const file = writeEvidence('perf-001.txt', lines);
  console.log(lines.join('\n'));
  console.log(`\nWritten: ${file}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
