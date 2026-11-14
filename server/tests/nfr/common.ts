/**
 * Shared setup for the NFR checks (PERF-001, REL-001). These are standalone scripts run with tsx,
 * not part of `npm test`, because they are slow and restart infrastructure.
 *
 * - Loads server/.env.test (fallback server/.env) and forces NODE_ENV=test so src/db.ts connects to
 *   TEST_DATABASE_URL only.
 * - Refuses to run unless the target database name contains "test" as a word and differs from
 *   DATABASE_URL. Values are never printed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

export const SERVER_DIR = path.resolve(__dirname, '..', '..');
export const EVIDENCE_DIR = path.resolve(SERVER_DIR, '..', 'docs', 'sprints', 'sprint-1', 'evidence');

export interface NfrEnv {
  TEST_DATABASE_URL: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  testDbHost: string;
  testDbPort: string;
  testDbName: string;
}

export function setupTestEnv(): NfrEnv {
  const read = (name: string): Record<string, string> => {
    const file = path.join(SERVER_DIR, name);
    return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  };
  const merged = { ...read('.env'), ...read('.env.test') };
  const testUrl = merged.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('Refused: TEST_DATABASE_URL is not set in server/.env.test.');
  if (testUrl === merged.DATABASE_URL) throw new Error('Refused: TEST_DATABASE_URL equals DATABASE_URL.');
  const url = new URL(testUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/(^|[_-])test([_-]|$)/i.test(dbName)) {
    throw new Error('Refused: the target database name does not look like a test database.');
  }
  if (!merged.SESSION_SECRET) throw new Error('Refused: SESSION_SECRET is not set.');

  process.env.NODE_ENV = 'test';
  process.env.TEST_DATABASE_URL = testUrl;
  process.env.DATABASE_URL = merged.DATABASE_URL ?? '';
  process.env.SESSION_SECRET = merged.SESSION_SECRET;

  return {
    TEST_DATABASE_URL: testUrl,
    DATABASE_URL: merged.DATABASE_URL ?? '',
    SESSION_SECRET: merged.SESSION_SECRET,
    testDbHost: url.hostname,
    testDbPort: url.port || '5432',
    testDbName: dbName,
  };
}

export function hostInfo(): string {
  return `${os.type()} ${os.release()}, ${os.cpus()[0]?.model ?? 'unknown CPU'} x${os.cpus().length}, ` +
    `${Math.round(os.totalmem() / 2 ** 30)} GiB RAM, Node ${process.version}`;
}

export function writeEvidence(fileName: string, lines: string[]): string {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, fileName);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

/** Minimal cookie-carrying HTTP client over Node's fetch (real TCP to the running API). */
export class HttpUser {
  constructor(public readonly base: string, public cookie = '', public csrf = '') {}

  static async login(base: string, email: string, password: string): Promise<HttpUser> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
    await res.arrayBuffer();
    const user = new HttpUser(base);
    user.absorbCookies(res);
    return user;
  }

  absorbCookies(res: Response): void {
    const jar = new Map(this.cookie ? this.cookie.split('; ').map((c) => c.split('=', 2) as [string, string]) : []);
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const csrf = jar.get('qms_csrf');
    if (csrf) this.csrf = decodeURIComponent(csrf);
  }

  async get(p: string): Promise<{ status: number; body: any }> {
    const res = await fetch(`${this.base}${p}`, { headers: { Cookie: this.cookie } });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async post(p: string): Promise<{ status: number; body: any }> {
    const res = await fetch(`${this.base}${p}`, {
      method: 'POST',
      headers: { Cookie: this.cookie, 'X-CSRF-Token': this.csrf },
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}
