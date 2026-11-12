/**
 * Applies Prisma migrations to the isolated test database.
 *
 * Cross-platform replacement for `DATABASE_URL=... prisma migrate deploy`, which does not
 * work in PowerShell or cmd. Reads TEST_DATABASE_URL from server/.env.test (falling back to
 * server/.env) and refuses to run if it equals DATABASE_URL.
 */
import dotenv from 'dotenv';
import path from 'path';
import { spawnSync } from 'child_process';

const serverDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(serverDir, '.env.test') });
dotenv.config({ path: path.join(serverDir, '.env') });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set. Add it to server/.env.test.');
  process.exit(1);
}
if (testUrl === process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: testUrl },
});

process.exit(result.status ?? 1);
