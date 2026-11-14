/**
 * REL-001 / NFR-05 — a mutation reports success only after a durable commit, and committed records
 * survive an application and database crash-restart.
 *
 * Isolation (review of PR #7): this script never touches the PostgreSQL container used for the
 * development or the shared test database. It creates its own throwaway PostgreSQL container,
 * crashes and restarts only that container, and removes it (with its data) at the end.
 *  - The container is created by this run with a unique name (`qms-rel001-<timestamp>`), the label
 *    `qms.purpose=rel-001-throwaway`, a random per-run password, and a port bound to 127.0.0.1 only.
 *  - Before the kill, the script re-checks that the target is exactly the container it created
 *    (same id, label, and name prefix) and that it holds no database other than the throwaway one.
 *    If any check fails it refuses to kill anything.
 *  - The API under test gets only the throwaway URL; DATABASE_URL is set to an unreachable dummy so
 *    no development connection string is ever used.
 *  - Any other container publishing the shared test-database port (e.g. `qms-postgres`) is
 *    inspected before and after, and its StartedAt must be unchanged (proof it was not restarted).
 *
 * Method:
 *  1. Start the throwaway container, apply migrations, seed.
 *  2. Start the compiled API (dist/server.js, NODE_ENV=test) on :3101 against the throwaway DB.
 *  3. Drive join -> call-next -> start -> complete (customer1) and a join (customer2) over HTTP.
 *     Right after each 2xx response, read the row on a separate DB connection and require it to
 *     equal the response ("response follows commit").
 *  4. Require fsync, synchronous_commit and full_page_writes to be on.
 *  5. SIGKILL the API, SIGKILL the throwaway PostgreSQL container, start it again (WAL crash
 *     recovery, confirmed from its log), start the API again.
 *  6. With the pre-restart session cookies, read everything back and require it to be identical;
 *     lastQueueNumber unchanged; the next join continues from the persisted counter.
 *
 * Run: npm run test:rel --workspace=server   (writes docs/sprints/sprint-1/evidence/rel-001.txt)
 * Requires Docker and the `postgres:16-alpine` image (override with REL_PG_IMAGE).
 */
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import net from 'net';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { HttpUser, SERVER_DIR, hostInfo, setupTestEnv, writeEvidence } from './common';

const sharedEnv = setupTestEnv(); // SESSION_SECRET and the shared test-DB port (for the "not touched" check)

const IMAGE = process.env.REL_PG_IMAGE ?? 'postgres:16-alpine';
const LABEL_KEY = 'qms.purpose';
const LABEL_VALUE = 'rel-001-throwaway';
const NAME_PREFIX = 'qms-rel001-';
const CONTAINER = `${NAME_PREFIX}${Date.now()}`;
const PG_PORT = 55433;
const PG_USER = 'rel001';
const PG_DB = 'qms_rel001_test';
const PG_PASSWORD = randomBytes(18).toString('hex'); // per run, never written anywhere
const DB_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}?schema=public`;
const DUMMY_DEV_URL = 'postgresql://unused:unused@127.0.0.1:1/rel001_unused_dev';

const API_PORT = 3101;
const BASE = `http://127.0.0.1:${API_PORT}`;
const PASSWORD = 'Password123!';
const OPEN_QUEUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Everything this process imports from src/ must see only the throwaway database.
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DUMMY_DEV_URL;

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

function docker(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

let createdId = '';

/** Refuses unless `docker inspect` shows exactly the container this run created. */
function assertOwnThrowaway(): void {
  const r = docker(['inspect', CONTAINER, '--format', `{{.Id}}|{{.Name}}|{{index .Config.Labels "${LABEL_KEY}"}}`]);
  if (r.status !== 0) fail('throwaway container not found; refusing to kill anything');
  const [id, name, label] = r.stdout.split('|');
  if (id !== createdId) fail('container id differs from the one this run created; refusing to kill');
  if (!name.replace(/^\//, '').startsWith(NAME_PREFIX)) fail('container name is not a REL-001 throwaway name; refusing to kill');
  if (label !== LABEL_VALUE) fail('container is missing the REL-001 throwaway label; refusing to kill');
}

function otherContainersOnSharedPort(): Map<string, string> {
  const names = docker(['ps', '--filter', `publish=${sharedEnv.testDbPort}`, '--format', '{{.Names}}']).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  const started = new Map<string, string>();
  for (const n of names) started.set(n, docker(['inspect', n, '--format', '{{.State.StartedAt}}']).stdout);
  return started;
}

async function waitForDb(db: PrismaClient, timeoutMs = 60_000): Promise<number> {
  const t0 = Date.now();
  // The postgres image restarts once during first initialisation, so require two successes 1 s apart.
  let ok = 0;
  while (Date.now() - t0 < timeoutMs) {
    try {
      await db.$queryRaw`SELECT 1`;
      ok++;
      if (ok >= 2) return Date.now() - t0;
    } catch {
      ok = 0;
      await db.$disconnect().catch(() => undefined);
    }
    await sleep(1000);
  }
  fail('throwaway database did not become ready within 60 s');
}

async function startApi(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [path.join(SERVER_DIR, 'dist', 'server.js')], {
    cwd: SERVER_DIR,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'test',
      PORT: String(API_PORT),
      TEST_DATABASE_URL: DB_URL,
      DATABASE_URL: DUMMY_DEV_URL,
      SESSION_SECRET: sharedEnv.SESSION_SECRET,
      CORS_ORIGIN: '',
    },
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/api/auth/me`)).status === 401) return child;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) fail(`API exited during startup (code ${child.exitCode})`);
    await sleep(200);
  }
  child.kill('SIGKILL');
  fail('API did not start within 20 s');
}

async function stopHard(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGKILL');
  await exited;
}

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
const pick = (e: Row) => ({
  id: e.id,
  serviceQueueId: e.serviceQueueId,
  customerId: e.customerId,
  queueNumber: Number(e.queueNumber),
  status: e.status,
  joinedAt: iso(e.joinedAt),
  calledAt: iso(e.calledAt),
  serviceStartedAt: iso(e.serviceStartedAt),
  completedAt: iso(e.completedAt),
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main(): Promise<void> {
  const sharedBefore = otherContainersOnSharedPort();
  step(
    `shared test-DB port ${sharedEnv.testDbPort}: ${sharedBefore.size === 0 ? 'no container' : [...sharedBefore.keys()].join(', ')} ` +
      '(will not be touched; StartedAt recorded)'
  );

  if (docker(['image', 'inspect', IMAGE, '--format', '{{.Id}}']).status !== 0) fail(`image ${IMAGE} is not available locally`);
  if (await portInUse(PG_PORT)) fail(`port ${PG_PORT} is already in use`);
  if (await portInUse(API_PORT)) fail(`port ${API_PORT} is already in use`);

  const run = docker([
    'run', '-d',
    '--name', CONTAINER,
    '--label', `${LABEL_KEY}=${LABEL_VALUE}`,
    '-e', `POSTGRES_USER=${PG_USER}`,
    '-e', `POSTGRES_PASSWORD=${PG_PASSWORD}`,
    '-e', `POSTGRES_DB=${PG_DB}`,
    '-p', `127.0.0.1:${PG_PORT}:5432`,
    IMAGE,
  ]);
  if (run.status !== 0) fail('could not start the throwaway PostgreSQL container');
  createdId = run.stdout;
  step(`throwaway container ${CONTAINER} created (${IMAGE}, label ${LABEL_KEY}=${LABEL_VALUE}, 127.0.0.1:${PG_PORT})`);

  let db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  let api: ChildProcess | undefined;
  try {
    step(`throwaway database ready after ${await waitForDb(db)} ms`);

    const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: SERVER_DIR,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: DB_URL },
    });
    if (migrate.status !== 0) fail(`prisma migrate deploy failed on the throwaway database (exit ${migrate.status})`);
    step('migrations applied to the throwaway database');

    const { resetAndSeed } = await import('../helpers/auth');
    const { prisma: seedClient } = await import('../../src/db');
    await resetAndSeed();
    await seedClient.$disconnect();
    step('seeded');

    const settings = await db.$queryRaw<Array<{ name: string; setting: string }>>`
      SELECT name, setting FROM pg_settings WHERE name IN ('fsync', 'synchronous_commit', 'full_page_writes', 'wal_level') ORDER BY name`;
    step(`PostgreSQL durability settings: ${settings.map((s) => `${s.name}=${s.setting}`).join(', ')}`);
    for (const required of ['fsync', 'synchronous_commit', 'full_page_writes']) {
      if (settings.find((x) => x.name === required)?.setting !== 'on') fail(`${required} is not "on"`);
    }

    api = await startApi();
    step(`API started on :${API_PORT} against the throwaway database`);

    const c1 = await HttpUser.login(BASE, 'customer1@example.com', PASSWORD);
    const c2 = await HttpUser.login(BASE, 'customer2@example.com', PASSWORD);
    const op = await HttpUser.login(BASE, 'operator1@example.com', PASSWORD);

    const mutateAndVerify = async (label: string, call: () => Promise<{ status: number; body: any }>, expected: number) => {
      const res = await call();
      if (res.status !== expected) fail(`${label} returned ${res.status}`);
      const entry = res.body.data.entry;
      const row = await db.queueEntry.findUnique({ where: { id: entry.id } });
      if (!row || !same(pick(row as unknown as Row), pick(entry))) fail(`${label}: DB row does not match the response`);
      step(`${label}: HTTP ${res.status}, status ${entry.status}; separate connection sees the same committed row`);
      return entry;
    };

    const joined = await mutateAndVerify('customer1 join', () => c1.post(`/api/queues/${OPEN_QUEUE_ID}/entries`), 201);
    await mutateAndVerify('operator1 call-next', () => op.post(`/api/operator/queues/${OPEN_QUEUE_ID}/call-next`), 200);
    await mutateAndVerify('operator1 start', () => op.post(`/api/operator/queue-entries/${joined.id}/start`), 200);
    const completed = await mutateAndVerify('operator1 complete', () => op.post(`/api/operator/queue-entries/${joined.id}/complete`), 200);
    const waiting = await mutateAndVerify('customer2 join', () => c2.post(`/api/queues/${OPEN_QUEUE_ID}/entries`), 201);
    const counterBefore = (await db.serviceQueue.findUniqueOrThrow({ where: { id: OPEN_QUEUE_ID } })).lastQueueNumber;
    const sessionsBefore = await db.session.count();

    // ---- crash ----
    await stopHard(api);
    step('API hard-killed (SIGKILL), no graceful shutdown');

    const databases = await db.$queryRaw<Array<{ datname: string }>>`SELECT datname FROM pg_database ORDER BY datname`;
    const unexpected = databases.map((d) => d.datname).filter((n) => ![PG_DB, 'postgres', 'template0', 'template1'].includes(n));
    if (unexpected.length > 0) fail('the container holds databases other than the throwaway one; refusing to kill');
    await db.$disconnect();
    assertOwnThrowaway();
    step(`safety check passed: target is this run's own container (id, name, label) and holds only "${PG_DB}"`);

    const killedAt = new Date().toISOString();
    if (docker(['kill', '--signal=SIGKILL', CONTAINER]).status !== 0) fail('docker kill failed');
    step(`docker kill --signal=SIGKILL ${CONTAINER}: PostgreSQL killed without shutdown`);
    for (let i = 0; i < 20 && docker(['inspect', '-f', '{{.State.Running}}', CONTAINER]).stdout !== 'false'; i++) await sleep(250);
    assertOwnThrowaway();
    if (docker(['start', CONTAINER]).status !== 0) fail('docker start failed');
    step(`docker start ${CONTAINER}: done`);

    db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    step(`database accepting connections again after ${await waitForDb(db)} ms`);
    const pgLog = docker(['logs', '--since', killedAt, CONTAINER]);
    const recovery = `${pgLog.stdout}\n${pgLog.stderr}`
      .split(/\r?\n/)
      .filter((l) => /not properly shut down|automatic recovery|redo (starts|done)/.test(l))
      .slice(-3);
    if (!recovery.some((l) => l.includes('not properly shut down'))) fail('PostgreSQL log shows no crash recovery');
    for (const l of recovery) step(`postgres log: ${l.replace(/^\S+ \S+ UTC \[\d+\] /, '').slice(0, 110)}`);

    api = await startApi();
    step('API restarted');

    // ---- verify ----
    const c1After = await c1.get(`/api/me/queue-entries/${completed.id}`);
    if (c1After.status !== 200 || !same(pick(c1After.body.data.entry), pick(completed))) fail('completed entry changed across restart');
    step('customer1 (pre-restart cookie): COMPLETED entry identical to the pre-restart response, all 4 timestamps');
    const c2After = await c2.get(`/api/me/queue-entries/${waiting.id}`);
    if (c2After.status !== 200 || !same(pick(c2After.body.data.entry), pick(waiting))) fail('waiting entry changed across restart');
    step('customer2 (pre-restart cookie): WAITING entry identical to the pre-restart response');
    const opList = await op.get(`/api/operator/queues/${OPEN_QUEUE_ID}/entries`);
    if (opList.status !== 200 || !same(opList.body.data.entries.map((e: Row) => e.id), [completed.id, waiting.id])) {
      fail('operator list changed across restart');
    }
    step('operator1 (pre-restart cookie): queue list unchanged (2 entries, FIFO order)');
    const counterAfter = (await db.serviceQueue.findUniqueOrThrow({ where: { id: OPEN_QUEUE_ID } })).lastQueueNumber;
    const sessionsAfter = await db.session.count();
    if (counterAfter !== counterBefore || sessionsAfter !== sessionsBefore) fail('counter or sessions changed across restart');
    step(`DB direct: lastQueueNumber ${counterAfter} (unchanged), ${sessionsAfter} session rows (unchanged)`);
    const next = await c1.post(`/api/queues/${OPEN_QUEUE_ID}/entries`);
    if (next.status !== 201 || next.body.data.entry.queueNumber !== Number(counterBefore) + 1) fail('post-restart join did not continue the counter');
    step(`post-restart join: HTTP 201, queueNumber ${next.body.data.entry.queueNumber} (continues from the persisted counter)`);
  } finally {
    await stopHard(api);
    await db.$disconnect().catch(() => undefined);
    if (createdId) {
      assertOwnThrowaway();
      const rm = docker(['rm', '-f', '-v', CONTAINER]);
      step(rm.status === 0 ? `throwaway container ${CONTAINER} removed with its volume` : `WARNING: could not remove ${CONTAINER}`);
    }
  }

  const sharedAfter = otherContainersOnSharedPort();
  for (const [name, startedAt] of sharedBefore) {
    if (sharedAfter.get(name) !== startedAt) fail(`container ${name} on the shared test-DB port was restarted`);
  }
  step(
    sharedBefore.size === 0
      ? 'no other PostgreSQL container was running on the shared test-DB port'
      : `${[...sharedBefore.keys()].join(', ')}: StartedAt unchanged (${[...sharedBefore.values()].join(', ')}), not restarted or killed`
  );
}

main()
  .then(() => {
    const file = writeEvidence('rel-001.txt', [
      `REL-001 / NFR-05 run: ${new Date().toISOString()}`,
      'Command: npm run test:rel --workspace=server   (npm run build && tsx tests/nfr/rel-001.ts)',
      `Host: ${hostInfo()}`,
      `Database: throwaway ${IMAGE} container created and removed by this run (not the dev/shared test container)`,
      '',
      ...log,
      '',
      'Overall: PASSED',
    ]);
    console.log(`\nREL-001 PASSED. Written: ${file}`);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    if (createdId) {
      try {
        assertOwnThrowaway();
        docker(['rm', '-f', '-v', CONTAINER]);
      } catch {
        /* leave it for manual cleanup rather than touch anything unverified */
      }
    }
    process.exit(1);
  });
