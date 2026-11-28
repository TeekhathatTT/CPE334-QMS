/**
 * PERF-S3-001 / NFR-04 — F-11 analytics read on a seeded 1,000-entry dataset at the 31-day maximum range.
 * Same method as PERF-001 / PERF-S2-001 … PERF-S2-004 (sequential client-side wall time over TCP).
 *
 * Dataset: 1,000 entries in the OPEN queue spread evenly over 2026-11-01 … 2026-12-01 (Asia/Bangkok),
 *          mixed statuses (60% COMPLETED, 10% CANCELLED, 10% NO_SHOW, 10% SERVING/CALLED, 10% WAITING).
 * Operation (docs/sprints/sprint-3/tests.md §2.2):
 *   GET /api/operator/queues/:id/analytics?from=2026-11-01&to=2026-12-01 (5 warm-ups + 100 timed);
 *   every response is checked: joined = 1,000 and 31 daily rows.
 *
 * Run: npm run test:perf:f11 --workspace=server
 * Writes docs/sprints/sprint-3/evidence/perf-s3-001.txt
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
const PASSWORD = 'Password123!';
const OPEN_QUEUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FROM = '2026-11-01';
const TO = '2026-12-01';
const EVIDENCE_DIR = path.resolve(SERVER_DIR, '..', 'docs', 'sprints', 'sprint-3', 'evidence');

function pct(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

type Status = 'WAITING' | 'CALLED' | 'SERVING' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

function statusFor(i: number): Status {
  const k = i % 10;
  if (k < 6) return 'COMPLETED';
  if (k === 6) return 'CANCELLED';
  if (k === 7) return 'NO_SHOW';
  if (k === 8) return i % 20 === 8 ? 'SERVING' : 'CALLED';
  return 'WAITING';
}

async function main(): Promise<void> {
  const { app } = await import('../../src/app');
  const { prisma } = await import('../../src/db');
  const { resetAndSeed } = await import('../helpers/auth');

  await resetAndSeed();
  // One customer per entry so that the active-entry partial unique index is respected.
  await prisma.user.createMany({
    data: Array.from({ length: DATASET }, (_, i) => ({
      email: `perf-f11-c-${i}@example.com`,
      passwordHash: 'not-a-login-account',
      role: 'CUSTOMER' as const,
      accountStatus: 'ACTIVE' as const,
    })),
  });
  const users = await prisma.user.findMany({ where: { email: { startsWith: 'perf-f11-c-' } }, select: { id: true, email: true } });
  const byEmail = new Map(users.map((u) => [u.email, u.id]));
  const start = Date.parse('2026-10-31T17:00:00.000Z'); // 2026-11-01 00:00 Asia/Bangkok
  const span = 31 * 24 * 3600 * 1000;
  await prisma.queueEntry.createMany({
    data: Array.from({ length: DATASET }, (_, i) => {
      const joinedAt = start + Math.floor((i * span) / DATASET);
      const status = statusFor(i);
      const called = ['CALLED', 'SERVING', 'COMPLETED', 'NO_SHOW'].includes(status);
      const started = ['SERVING', 'COMPLETED'].includes(status);
      return {
        customerId: byEmail.get(`perf-f11-c-${i}@example.com`)!,
        serviceQueueId: OPEN_QUEUE_ID,
        queueNumber: BigInt(i + 1),
        status,
        priority: i % 7 === 0 ? ('PRIORITY' as const) : ('NORMAL' as const),
        joinedAt: new Date(joinedAt),
        calledAt: called ? new Date(joinedAt + (60 + (i % 600)) * 1000) : null,
        serviceStartedAt: started ? new Date(joinedAt + (90 + (i % 600)) * 1000) : null,
        completedAt: status === 'COMPLETED' ? new Date(joinedAt + (390 + (i % 900)) * 1000) : null,
        cancelledAt: status === 'CANCELLED' ? new Date(joinedAt + 120 * 1000) : null,
        noShowAt: status === 'NO_SHOW' ? new Date(joinedAt + 900 * 1000) : null,
        noShowCount: status === 'NO_SHOW' ? 1 : 0,
      };
    }),
  });
  await prisma.serviceQueue.update({ where: { id: OPEN_QUEUE_ID }, data: { lastQueueNumber: BigInt(DATASET) } });
  const datasetCount = await prisma.queueEntry.count();

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const times: number[] = [];
  let sample: any = null;
  try {
    const op = await HttpUser.login(url, 'operator1@example.com', PASSWORD);
    for (let i = 0; i < WARMUP + RUNS; i++) {
      const t0 = performance.now();
      const r = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/analytics?from=${FROM}&to=${TO}`);
      const dt = performance.now() - t0;
      if (r.status !== 200) throw new Error(`request ${i} returned ${r.status}`);
      const a = r.body.data.analytics;
      if (a.volumes.joined !== DATASET || a.daily.length !== 31) {
        throw new Error(`unexpected report: joined=${a.volumes.joined}, days=${a.daily.length}`);
      }
      sample = a;
      if (i >= WARMUP) times.push(dt);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }

  const pg = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() AS version`;
  await prisma.$disconnect();

  times.sort((a, b) => a - b);
  const p50 = pct(times, 0.5);
  const p95 = pct(times, 0.95);
  const max = times[times.length - 1];
  const pass = p95 <= READ_P95_MS;
  const fmt = (n: number) => n.toFixed(1).padStart(8);
  const name = 'GET /api/operator/queues/:id/analytics (31 days)';
  const lines = [
    `PERF-S3-001 / NFR-04 run (F-11): ${new Date().toISOString()}`,
    `Command: npm run test:perf:f11 --workspace=server   (tsx tests/nfr/perf-s3-001-analytics.ts)`,
    `Host: ${hostInfo()}`,
    `Database: ${pg[0].version.split(',')[0]}, test database "${env.testDbName}" on ${env.testDbHost}:${env.testDbPort}`,
    `Method: same as PERF-001. Real Express app on a local ephemeral port, sequential HTTP requests (Node fetch,`,
    `        real cookies), ${WARMUP} untimed warm-ups then ${RUNS} timed requests.`,
    `Dataset: ${datasetCount} entries in the OPEN queue over ${FROM}..${TO} (Asia/Bangkok), mixed statuses;`,
    `         each response checked: joined=${sample.volumes.joined}, daily rows=${sample.daily.length}, waitTime.count=${sample.waitTime.count}, serviceTime.count=${sample.serviceTime.count}.`,
    `Target: read p95 <= ${READ_P95_MS} ms.`,
    '',
    `${'Operation'.padEnd(52)} ${'kind'.padEnd(6)} ${'n'.padStart(4)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'max ms'.padStart(8)} target  result`,
    `${name.padEnd(52)} ${'read'.padEnd(6)} ${String(times.length).padStart(4)} ${fmt(p50)} ${fmt(p95)} ${fmt(max)} ${String(READ_P95_MS).padStart(6)}  ${pass ? 'PASS' : 'FAIL'}`,
    '',
    `Overall: ${pass ? 'PASSED' : 'FAILED'}`,
  ];
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, 'perf-s3-001.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nWritten: ${file}`);
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
