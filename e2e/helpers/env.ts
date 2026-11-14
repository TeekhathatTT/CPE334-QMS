/**
 * Loads the isolated test-database configuration for the E2E run and refuses anything that does
 * not look like a test database. Values are never printed.
 *
 * Source: server/.env.test (falling back to server/.env), the same files `npm run migrate:test`
 * and the server Vitest suite use.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export const ROOT_DIR = path.resolve(__dirname, '..', '..');
export const SERVER_DIR = path.join(ROOT_DIR, 'server');

export interface E2eEnv {
  TEST_DATABASE_URL: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
}

function databaseName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('E2E refused to start: TEST_DATABASE_URL is not a valid URL.');
  }
}

let cached: E2eEnv | undefined;

export function loadE2eEnv(): E2eEnv {
  if (cached) return cached;

  // Read the files without touching process.env so a developer's shell values cannot redirect us.
  const fromFile = (name: string): Record<string, string> => {
    const file = path.join(SERVER_DIR, name);
    return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  };
  const merged = { ...fromFile('.env'), ...fromFile('.env.test') };

  const testUrl = merged.TEST_DATABASE_URL;
  const devUrl = merged.DATABASE_URL ?? '';
  const secret = merged.SESSION_SECRET;

  if (!testUrl) {
    throw new Error('E2E refused to start: TEST_DATABASE_URL is not set in server/.env.test.');
  }
  if (testUrl === devUrl) {
    throw new Error('E2E refused to start: TEST_DATABASE_URL equals DATABASE_URL.');
  }
  const testDb = databaseName(testUrl);
  if (!/(^|[_-])test([_-]|$)/i.test(testDb)) {
    throw new Error(
      `E2E refused to start: the target database name does not look like a test database ` +
        `(expected a name containing "test" as a word, e.g. qms_test_db).`
    );
  }
  if (devUrl && databaseName(devUrl) === testDb && new URL(devUrl).host === new URL(testUrl).host) {
    throw new Error('E2E refused to start: TEST_DATABASE_URL points at the same database as DATABASE_URL.');
  }
  if (!secret) {
    throw new Error('E2E refused to start: SESSION_SECRET is not set in server/.env.test.');
  }

  cached = { TEST_DATABASE_URL: testUrl, DATABASE_URL: devUrl, SESSION_SECRET: secret };
  return cached;
}

/** Makes server modules imported in this process (src/db.ts) resolve to the test database. */
export function pointProcessAtTestDb(): void {
  const env = loadE2eEnv();
  process.env.NODE_ENV = 'test';
  process.env.TEST_DATABASE_URL = env.TEST_DATABASE_URL;
  process.env.DATABASE_URL = env.DATABASE_URL;
  process.env.SESSION_SECRET = env.SESSION_SECRET;
}
