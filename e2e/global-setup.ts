/**
 * Runs once before the E2E suite:
 *   1. refuses to continue unless the target is a test database (env.ts)
 *   2. applies migrations to the test database (`npm run migrate:test`)
 *   3. resets all rows and re-seeds
 * Each spec also resets in beforeEach, so tests never depend on order.
 */
import { spawnSync } from 'child_process';
import { loadE2eEnv, ROOT_DIR } from './helpers/env';
import { disconnectDb, resetDatabase } from './helpers/db';

export default async function globalSetup(): Promise<void> {
  loadE2eEnv();

  const migrate = spawnSync('npm', ['run', 'migrate:test'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  if (migrate.status !== 0) {
    // Only the tail is shown; Prisma prints host/port/database name but never the password.
    throw new Error(`npm run migrate:test failed (exit ${migrate.status}).\n${(migrate.stderr || '').slice(-600)}`);
  }

  await resetDatabase();
  await disconnectDb();
}
