import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { resolveVersion } from '../src/routes/health';

/**
 * Lab 5 Issue #17, item 2: GET /api/health (status, database check, running version).
 * The healthy cases use the real isolated test database (TEST_DATABASE_URL).
 */
const VERSION_VARS = ['COMMIT_SHA', 'APP_VERSION'] as const;
let savedEnv: Partial<Record<(typeof VERSION_VARS)[number], string | undefined>>;

beforeEach(() => {
  savedEnv = {};
  for (const name of VERSION_VARS) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of VERSION_VARS) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  vi.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('returns 200 with exactly status, database and version', async () => {
    process.env.COMMIT_SHA = 'abc1234';
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ status: 'ok', database: 'ok', version: 'abc1234' });
  });

  it('takes the version from COMMIT_SHA, preferring it over APP_VERSION', async () => {
    process.env.COMMIT_SHA = 'test123';
    process.env.APP_VERSION = '1.2.3';
    const res = await request(app).get('/api/health');
    expect(res.body.version).toBe('test123');
  });

  it('falls back to APP_VERSION, then to "unknown"', async () => {
    process.env.APP_VERSION = '1.2.3';
    expect((await request(app).get('/api/health')).body.version).toBe('1.2.3');

    delete process.env.APP_VERSION;
    expect((await request(app).get('/api/health')).body.version).toBe('unknown');

    process.env.COMMIT_SHA = '   ';
    expect(resolveVersion()).toBe('unknown');
  });

  it('works without a session, and ignores an invalid session cookie', async () => {
    const noCookie = await request(app).get('/api/health');
    expect(noCookie.status).toBe(200);
    expect(noCookie.headers['set-cookie']).toBeUndefined();

    const badCookie = await request(app).get('/api/health').set('Cookie', 'qms_session=not-a-real-session');
    expect(badCookie.status).toBe(200);
    expect(badCookie.body.status).toBe('ok');
  });

  it('runs no query other than the single database check', async () => {
    const queryRaw = vi.spyOn(prisma, '$queryRaw');
    const findUnique = vi.spyOn(prisma.session, 'findUnique');
    await request(app).get('/api/health').set('Cookie', 'qms_session=some-token');
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns 503 without leaking details when the database check fails', async () => {
    process.env.COMMIT_SHA = 'test123';
    const fakeUrl = 'postgresql://leak-user:fake-password-for-leak-test@db.internal:5432/qms_db';
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(
      new Error(`Can't reach database server at ${fakeUrl} (ECONNREFUSED)`)
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'unavailable', version: 'test123' });
    for (const forbidden of [
      'fake-password-for-leak-test',
      'leak-user',
      'postgresql://',
      'ECONNREFUSED',
      "Can't reach",
      'at ',
      process.env.DATABASE_URL,
      process.env.TEST_DATABASE_URL,
      process.env.SESSION_SECRET,
    ]) {
      if (forbidden) expect(res.text).not.toContain(forbidden);
    }
    // The real error is logged server-side.
    expect(logged).toHaveBeenCalled();
  });

  it('a failing check with a session cookie is still 503, not a 500 from session loading', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(prisma.session, 'findUnique').mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/api/health').set('Cookie', 'qms_session=some-token');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
  });
});
