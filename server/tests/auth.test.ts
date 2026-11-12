import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { AccountStatus, Role } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { hashPassword } from '../src/auth/password';
import { hashSessionToken } from '../src/auth/session';
import {
  CUSTOMER1,
  OPERATOR1,
  SEED_PASSWORD,
  getSetCookie,
  login,
  resetAndSeed,
  withoutRequestId,
} from './helpers/auth';

const DISABLED_USER = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'disabled.test@example.com',
  password: 'Disabled-Test-Password-1!',
};

describe('Authentication API (real PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
    await resetAndSeed();
    // Test-only DISABLED account (not part of the seed).
    await prisma.user.create({
      data: {
        id: DISABLED_USER.id,
        email: DISABLED_USER.email,
        passwordHash: await hashPassword(DISABLED_USER.password),
        role: Role.CUSTOMER,
        accountStatus: AccountStatus.DISABLED,
      },
    });
  });

  beforeEach(async () => {
    await prisma.session.deleteMany({});
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({ where: { id: DISABLED_USER.id } });
    await prisma.$disconnect();
  });

  describe('AUTH-001 / AUTH-002: login success', () => {
    it.each([
      ['AUTH-001', CUSTOMER1, 'CUSTOMER'],
      ['AUTH-002', OPERATOR1, 'OPERATOR'],
    ])('%s: %s signs in, gets an HttpOnly SameSite=Lax session, and /me returns the same identity', async (_id, account, role) => {
      const res = await request(app).post('/api/auth/login').send({ email: account.email, password: SEED_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { user: { id: account.id, email: account.email, role } } });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      const session = getSetCookie(res, 'qms_session');
      const csrf = getSetCookie(res, 'qms_csrf');
      expect(session).toBeDefined();
      expect(session!.attributes).toEqual(expect.arrayContaining(['httponly', 'samesite=lax', 'path=/']));
      expect(session!.attributes).not.toContain('secure'); // Secure only when NODE_ENV=production
      expect(csrf).toBeDefined();
      expect(csrf!.attributes).toEqual(expect.arrayContaining(['samesite=lax', 'path=/']));
      expect(csrf!.attributes).not.toContain('httponly'); // readable by the client by design

      // A session row exists and stores only the HMAC, never the raw cookie value.
      const rows = await prisma.session.findMany({ where: { userId: account.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).not.toBe(session!.value);
      expect(rows[0].tokenHash).toBe(hashSessionToken(session!.value));
      expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
      const lifetimeMs = rows[0].expiresAt.getTime() - rows[0].createdAt.getTime();
      expect(Math.abs(lifetimeMs - 8 * 60 * 60 * 1000)).toBeLessThan(60_000);

      const me = await request(app).get('/api/auth/me').set('Cookie', `qms_session=${session!.value}`);
      expect(me.status).toBe(200);
      expect(me.body).toEqual({ data: { user: { id: account.id, email: account.email, role } } });
      // /me re-issues the CSRF cookie with the session's token.
      expect(getSetCookie(me, 'qms_csrf')?.value).toBe(csrf!.value);
    });

    it('AUTH-001: normalizes email case and surrounding whitespace before lookup', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '  Customer1@Example.COM ', password: SEED_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(CUSTOMER1.email);
    });

    it('AUTH-001: a new login replaces a session presented with the request (no fixation)', async () => {
      const first = await login(app, CUSTOMER1.email);
      const second = await request(app)
        .post('/api/auth/login')
        .set('Cookie', first.cookieHeader)
        .send({ email: CUSTOMER1.email, password: SEED_PASSWORD });
      expect(second.status).toBe(200);

      const newToken = getSetCookie(second, 'qms_session')!.value;
      expect(newToken).not.toBe(first.sessionToken);
      expect(await prisma.session.count({ where: { tokenHash: hashSessionToken(first.sessionToken) } })).toBe(0);
      expect((await request(app).get('/api/auth/me').set('Cookie', `qms_session=${first.sessionToken}`)).status).toBe(401);
    });
  });

  describe('AUTH-003: logout revokes the session', () => {
    it('AUTH-003: logout returns 204, deletes the row, and the old cookie is rejected afterwards', async () => {
      const session = await login(app, CUSTOMER1.email);

      const logout = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', session.cookieHeader)
        .set('X-CSRF-Token', session.csrfToken);
      expect(logout.status).toBe(204);
      expect(logout.text).toBe('');
      expect(await prisma.session.count({ where: { tokenHash: hashSessionToken(session.sessionToken) } })).toBe(0);
      // Both cookies are cleared.
      expect(getSetCookie(logout, 'qms_session')?.value).toBe('');
      expect(getSetCookie(logout, 'qms_csrf')?.value).toBe('');

      const me = await request(app).get('/api/auth/me').set('Cookie', session.cookieHeader);
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe('UNAUTHORIZED');

      const secondLogout = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', session.cookieHeader)
        .set('X-CSRF-Token', session.csrfToken);
      expect(secondLogout.status).toBe(401);
      expect(secondLogout.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('AUTH-004: invalid credentials', () => {
    it('AUTH-004: wrong password, unknown email, and DISABLED account get identical 401 bodies and no cookies', async () => {
      const attempts = [
        { email: CUSTOMER1.email, password: 'definitely-wrong-password' },
        { email: 'nobody.registered@example.com', password: SEED_PASSWORD },
        { email: DISABLED_USER.email, password: DISABLED_USER.password },
      ];

      const responses = [];
      for (const body of attempts) {
        responses.push(await request(app).post('/api/auth/login').send(body));
      }

      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(res.body.data).toBeUndefined();
        expect(res.body.error).toEqual({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password.',
          requestId: expect.any(String),
        });
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      const normalized = responses.map((res) => withoutRequestId(res.body));
      expect(normalized[1]).toEqual(normalized[0]);
      expect(normalized[2]).toEqual(normalized[0]);
      expect(await prisma.session.count()).toBe(0);
    });

    it.each([
      ['missing email', { password: SEED_PASSWORD }],
      ['missing password', { email: CUSTOMER1.email }],
      ['empty password', { email: CUSTOMER1.email, password: '' }],
      ['blank email', { email: '   ', password: SEED_PASSWORD }],
      ['non-string email', { email: 42, password: SEED_PASSWORD }],
      ['oversized email', { email: `${'a'.repeat(250)}@example.com`, password: SEED_PASSWORD }],
      ['oversized password', { email: CUSTOMER1.email, password: 'x'.repeat(201) }],
    ])('AUTH-004: %s returns 400 INVALID_ARGUMENT', async (_label, body) => {
      const res = await request(app).post('/api/auth/login').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('AUTH-004: malformed JSON returns 400 INVALID_ARGUMENT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "customer1@example.com", "password": ');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
    });
  });

  describe('AUTH-005: identity and invalid or expired sessions', () => {
    it('AUTH-005: a session whose expiresAt is in the past gets 401 and is deleted', async () => {
      const session = await login(app, CUSTOMER1.email);
      await prisma.session.updateMany({
        where: { tokenHash: hashSessionToken(session.sessionToken) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const me = await request(app).get('/api/auth/me').set('Cookie', session.cookieHeader);
      expect(me.status).toBe(401);
      expect(me.body.error).toEqual({ code: 'UNAUTHORIZED', message: expect.any(String), requestId: expect.any(String) });
      expect(await prisma.session.count({ where: { tokenHash: hashSessionToken(session.sessionToken) } })).toBe(0);
    });

    it('AUTH-005: missing cookie and tampered cookie get 401', async () => {
      const session = await login(app, CUSTOMER1.email);

      const missing = await request(app).get('/api/auth/me');
      expect(missing.status).toBe(401);
      expect(missing.body.error.code).toBe('UNAUTHORIZED');

      const lastChar = session.sessionToken.slice(-1);
      const tampered = session.sessionToken.slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');
      const tamperedRes = await request(app).get('/api/auth/me').set('Cookie', `qms_session=${tampered}`);
      expect(tamperedRes.status).toBe(401);

      const oversized = await request(app).get('/api/auth/me').set('Cookie', `qms_session=${'a'.repeat(4000)}`);
      expect(oversized.status).toBe(401);
    });

    it('AUTH-005: the session of a user who is later DISABLED gets 401', async () => {
      const operator = await login(app, OPERATOR1.email);
      await prisma.user.update({ where: { id: OPERATOR1.id }, data: { accountStatus: AccountStatus.DISABLED } });
      try {
        const me = await request(app).get('/api/auth/me').set('Cookie', operator.cookieHeader);
        expect(me.status).toBe(401);
        expect(me.body.error.code).toBe('UNAUTHORIZED');
      } finally {
        await prisma.user.update({ where: { id: OPERATOR1.id }, data: { accountStatus: AccountStatus.ACTIVE } });
      }
    });
  });

  describe('SEC-001: passwords, hashes, and tokens never leak (regression)', () => {
    const DISTINCTIVE_PASSWORD = 'Sec001-Distinctive-Pa55word!';
    const capturedLogs: string[] = [];
    let originalNodeEnv: string | undefined;

    beforeEach(async () => {
      await prisma.user.update({
        where: { id: CUSTOMER1.id },
        data: { passwordHash: await hashPassword(DISTINCTIVE_PASSWORD) },
      });
      capturedLogs.length = 0;
      const capture = (...args: unknown[]) => {
        capturedLogs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
      };
      vi.spyOn(console, 'log').mockImplementation(capture);
      vi.spyOn(console, 'info').mockImplementation(capture);
      vi.spyOn(console, 'warn').mockImplementation(capture);
      vi.spyOn(console, 'error').mockImplementation(capture);
      // requestLogger is silent under NODE_ENV=test; switch it on so the logs are actually produced.
      originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
    });

    afterEach(async () => {
      process.env.NODE_ENV = originalNodeEnv;
      vi.restoreAllMocks();
      await prisma.user.update({
        where: { id: CUSTOMER1.id },
        data: { passwordHash: await hashPassword(SEED_PASSWORD) },
      });
    });

    it('SEC-001: the password, its hash, and the session token appear in no response body or log line', async () => {
      const success = await request(app)
        .post('/api/auth/login')
        .send({ email: CUSTOMER1.email, password: DISTINCTIVE_PASSWORD });
      const failure = await request(app)
        .post('/api/auth/login')
        .send({ email: CUSTOMER1.email, password: `${DISTINCTIVE_PASSWORD}-wrong` });
      expect(success.status).toBe(200);
      expect(failure.status).toBe(401);

      const sessionToken = getSetCookie(success, 'qms_session')!.value;
      const me = await request(app).get('/api/auth/me').set('Cookie', `qms_session=${sessionToken}`);
      expect(me.status).toBe(200);

      const storedHash = (await prisma.user.findUniqueOrThrow({ where: { id: CUSTOMER1.id } })).passwordHash;
      const bodies = [success.text, failure.text, me.text].join('\n');
      const logs = capturedLogs.join('\n');

      // The request logger really ran (otherwise the log assertions would be vacuous).
      expect(logs).toContain('/api/auth/login');
      for (const secret of [DISTINCTIVE_PASSWORD, storedHash, sessionToken, hashSessionToken(sessionToken)]) {
        expect(bodies).not.toContain(secret);
        expect(logs).not.toContain(secret);
      }
      expect(bodies).not.toContain('passwordHash');
    });
  });
});
