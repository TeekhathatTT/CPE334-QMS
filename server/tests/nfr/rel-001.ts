/**
 * REL-001 / NFR-05 — a mutation reports success only after a durable commit, and committed records
 * survive an application and database restart.
 *
 * Method:
 *  1. Reset + seed the test DB. Start the compiled API (dist/server.js) as a child process on :3101
 *     with NODE_ENV=test (isolated TEST_DATABASE_URL).
 *  2. Drive join -> call-next -> start -> complete (customer1) and a second join (customer2) over
 *     HTTP. Right after each 2xx response, read the row on a separate DB connection and require it
 *     to equal the response ("response follows commit").
 *  3. Record PostgreSQL durability settings (fsync, synchronous_commit, full_page_writes).
 *  4. Hard-kill the API process, then SIGKILL the PostgreSQL container that serves the test
 *     database and start it again, forcing WAL crash recovery (the container also hosts the dev
 *     database, which is restarted but not modified).
 *  5. Start the API again. With the *pre-restart* session cookies (sessions are DB rows), read the
 *     entries back over HTTP and directly from the DB, and require them to equal the pre-restart
 *     responses; lastQueueNumber must be unchanged.
 *
 * Run: npm run test:rel --workspace=server   (writes docs/sprints/sprint-1/evidence/rel-001.txt)
 * Container override: REL_PG_CONTAINER=<name>; by default the container publishing the test DB port.
 */
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { HttpUser, SERVER_DIR, hostInfo, setupTestEnv, writeEvidence } from './common';

const env = setupTestEnv();
const PORT = 3101;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'Password123!';
const OPEN_QUEUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const log: string[] = [];
const step = (msg: string) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  log.push(line);
  console.log(line);
};

function fail(msg: string): never {
  throw new Error(`REL-001 FAILED: ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startApi(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [path.join(SERVER_DIR, 'dist', 'server.js')], {
    cwd: SERVER_DIR,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      TEST_DATABASE_URL: env.TEST_DATABASE_URL,
      DATABASE_URL: env.DATABASE_URL,
      SESSION_SECRET: env.SESSION_SECRET,
      CORS_ORIGIN: '',
    },
  });
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/api/auth/me`);
      if (res.status === 401) return child;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) fail(`API exited during startup (code ${child.exitCode})`);
    await sleep(200);
  }
  child.kill('SIGKILL');
  fail('API did not start within 20 s');
}

async function stopHard(child: ChildProcess): Promise<void> {
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGKILL');
  await exited;
}

function findContainer(): string {
  if (process.env.REL_PG_CONTAINER) return process.env.REL_PG_CONTAINER;
  const out = spawnSync('docker', ['ps', '--filter', `publish=${env.testDbPort}`, '--format', '{{.Names}}'], {
    encoding: 'utf8',
  });
  const names = (out.stdout || '').split(/\r?\n/).filter(Boolean);
  if (out.status !== 0 || names.length !== 1) {
    fail(`expected exactly one running container publishing port ${env.testDbPort}, found ${names.length}`);
  }
  return names[0];
}

async function waitForDb(db: PrismaClient): Promise<number> {
  const t0 = Date.now();
  for (let i = 0; i < 120; i++) {
    try {
      await db.$queryRaw`SELECT 1`;
      return Date.now() - t0;
    } catch {
      await sleep(500);
    }
  }
  fail('database did not come back within 60 s');
}

type Row = Record<string, unknown>;
const pick = (e: Row) => ({
  id: e.id,
  serviceQueueId: e.serviceQueueId,
  customerId: e.customerId,
  queueNumber: Number(e.queueNumber),
  status: e.status,
  joinedAt: e.joinedAt instanceof Date ? e.joinedAt.toISOString() : e.joinedAt,
  calledAt: e.calledAt instanceof Date ? e.calledAt.toISOString() : e.calledAt ?? null,
  serviceStartedAt: e.serviceStartedAt instanceof Date ? e.serviceStartedAt.toISOString() : e.serviceStartedAt ?? null,
  completedAt: e.completedAt instanceof Date ? e.completedAt.toISOString() : e.completedAt ?? null,
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main(): Promise<void> {
  const { resetAndSeed } = await import('../helpers/auth');
  const { prisma: seedClient } = await import('../../src/db');
  await resetAndSeed();
  await seedClient.$disconnect();

  // Separate connection used only for verification.
  let db = new PrismaClient({ datasources: { db: { url: env.TEST_DATABASE_URL } } });
  const container = findContainer();
  step(`test database "${env.testDbName}" on ${env.testDbHost}:${env.testDbPort}, container "${container}"`);

  const settings = await db.$queryRaw<Array<{ name: string; setting: string }>>`
    SELECT name, setting FROM pg_settings WHERE name IN ('fsync', 'synchronous_commit', 'full_page_writes', 'wal_level') ORDER BY name`;
  step(`PostgreSQL durability settings: ${settings.map((s) => `${s.name}=${s.setting}`).join(', ')}`);
  for (const required of ['fsync', 'synchronous_commit', 'full_page_writes']) {
    const s = settings.find((x) => x.name === required);
    if (!s || s.setting !== 'on') fail(`${required} is not "on"; commits would not be durable`);
  }

  let api = await startApi();
  step(`API started (pid ${api.pid}) on :${PORT}`);

  const c1 = await HttpUser.login(BASE, 'customer1@example.com', PASSWORD);
  const c2 = await HttpUser.login(BASE, 'customer2@example.com', PASSWORD);
  const op = await HttpUser.login(BASE, 'operator1@example.com', PASSWORD);

  async function mutateAndVerify(label: string, call: () => Promise<{ status: number; body: any }>, expected: number) {
    const res = await call();
    if (res.status !== expected) fail(`${label} returned ${res.status}`);
    const entry = res.body.data.entry;
    // Read immediately on a different connection: the committed row must already match.
    const row = await db.queueEntry.findUnique({ where: { id: entry.id } });
    if (!row || !same(pick(row as unknown as Row), pick(entry))) fail(`${label}: DB row does not match the response`);
    step(`${label}: HTTP ${res.status}, status ${entry.status}; separate connection sees the same committed row`);
    return entry;
  }

  const joined = await mutateAndVerify('customer1 join', () => c1.post(`/api/queues/${OPEN_QUEUE_ID}/entries`), 201);
  await mutateAndVerify('operator1 call-next', () => op.post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`), 200);
  await mutateAndVerify('operator1 start', () => op.post(`/api/operator/queue-entries/${joined.id}/start`), 200);
  const completed = await mutateAndVerify('operator1 complete', () => op.post(`/api/operator/queue-entries/${joined.id}/complete`), 200);
  const waiting = await mutateAndVerify('customer2 join', () => c2.post(`/api/queues/${OPEN_QUEUE_ID}/entries`), 201);
  const counterBefore = (await db.serviceQueue.findUniqueOrThrow({ where: { id: OPEN_QUEUE_ID } })).lastQueueNumber;
  const sessionsBefore = await db.session.count();

  // ---- restart everything ----
  await stopHard(api);
  step('API hard-killed (SIGKILL), no graceful shutdown');
  await db.$disconnect();
  // SIGKILL, not `docker restart`: no clean shutdown or checkpoint, so recovery must replay the WAL.
  const killedAt = new Date().toISOString();
  const k = spawnSync('docker', ['kill', '--signal=SIGKILL', container], { encoding: 'utf8' });
  if (k.status !== 0) fail(`docker kill failed (exit ${k.status})`);
  step(`docker kill --signal=SIGKILL ${container}: PostgreSQL killed without shutdown`);
  for (let i = 0; i < 20; i++) {
    const s = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', container], { encoding: 'utf8' });
    if ((s.stdout || '').trim() === 'false') break;
    await sleep(250);
  }
  const st = spawnSync('docker', ['start', container], { encoding: 'utf8' });
  if (st.status !== 0) fail(`docker start failed (exit ${st.status})`);
  step(`docker start ${container}: done`);
  db = new PrismaClient({ datasources: { db: { url: env.TEST_DATABASE_URL } } });
  const waited = await waitForDb(db);
  const uptime = await db.$queryRaw<Array<{ started: Date }>>`SELECT pg_postmaster_start_time() AS started`;
  step(`database accepting connections again after ${waited} ms; postmaster start time ${uptime[0].started.toISOString()}`);
  const pgLog = spawnSync('docker', ['logs', '--since', killedAt, container], { encoding: 'utf8' });
  const recovery = `${pgLog.stdout}\n${pgLog.stderr}`
    .split(/\r?\n/)
    .filter((l) => /not properly shut down|automatic recovery|redo (starts|done)/.test(l))
    .slice(-3);
  if (!recovery.some((l) => l.includes('not properly shut down'))) fail('PostgreSQL log shows no crash recovery');
  for (const l of recovery) step(`postgres log: ${l.replace(/^\S+ \S+ UTC \[\d+\] /, '').slice(0, 110)}`);
  api = await startApi();
  step(`API restarted (pid ${api.pid})`);

  try {
    // Pre-restart sessions are DB rows, so the old cookies must still authenticate.
    const c1After = await c1.get(`/api/me/queue-entries/${completed.id}`);
    if (c1After.status !== 200) fail(`customer1 read after restart returned ${c1After.status}`);
    if (!same(pick(c1After.body.data.entry), pick(completed))) fail('completed entry changed across restart');
    step('customer1 (pre-restart cookie): COMPLETED entry identical to the pre-restart response, all 4 timestamps');

    const c2After = await c2.get(`/api/me/queue-entries/${waiting.id}`);
    if (c2After.status !== 200 || !same(pick(c2After.body.data.entry), pick(waiting))) fail('waiting entry changed across restart');
    step('customer2 (pre-restart cookie): WAITING entry identical to the pre-restart response');

    const opList = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
    const ids = opList.body.data.entries.map((e: Row) => e.id);
    if (opList.status !== 200 || !same(ids, [completed.id, waiting.id])) fail('operator list changed across restart');
    step('operator1 (pre-restart cookie): queue list unchanged (2 entries, FIFO order)');

    const counterAfter = (await db.serviceQueue.findUniqueOrThrow({ where: { id: OPEN_QUEUE_ID } })).lastQueueNumber;
    if (counterAfter !== counterBefore) fail('lastQueueNumber changed across restart');
    const sessionsAfter = await db.session.count();
    if (sessionsAfter !== sessionsBefore) fail('session rows changed across restart');
    step(`DB direct: lastQueueNumber ${counterAfter} (unchanged), ${sessionsAfter} session rows (unchanged)`);

    // The restarted system keeps allocating from the persisted counter.
    const next = await c1.post(`/api/queues/${OPEN_QUEUE_ID}/entries`);
    if (next.status !== 201 || next.body.data.entry.queueNumber !== Number(counterBefore) + 1) fail('post-restart join did not continue the counter');
    step(`post-restart join: HTTP 201, queueNumber ${next.body.data.entry.queueNumber} (continues from the persisted counter)`);
  } finally {
    await stopHard(api);
    await db.$disconnect();
  }
}

main()
  .then(() => {
    const file = writeEvidence('rel-001.txt', [
      `REL-001 / NFR-05 run: ${new Date().toISOString()}`,
      'Command: npm run test:rel --workspace=server   (npm run build && tsx tests/nfr/rel-001.ts)',
      `Host: ${hostInfo()}`,
      '',
      ...log,
      '',
      'Overall: PASSED',
    ]);
    console.log(`\nREL-001 PASSED. Written: ${file}`);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
