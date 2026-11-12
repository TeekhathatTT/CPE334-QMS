import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { hashSessionToken } from '../src/auth/session';
import { requestIdMiddleware } from '../src/middleware/requestId';
import { loadSession } from '../src/middleware/session';
import { requireAuth } from '../src/middleware/auth';
import { requireCsrf } from '../src/middleware/csrf';
import { errorHandler } from '../src/middleware/errorHandler';
import { CUSTOMER1, SEED_PASSWORD, login, resetAndSeed } from './helpers/auth';

/**
 * SEC-002 is defined in tests.md against the join-queue endpoint, which does not exist until
 * Issue #5. These tests verify the CSRF middleware on logout and on a test-only mutation route;
 * the exact tests.md scenario must be re-run when join-queue is implemented.
 */
describe('SEC-002: CSRF enforcement (middleware level)', () => {
  const mutationHandler = vi.fn((req: Request, res: Response) => {
    res.status(200).json({ data: { mutated: true } });
  });
  const readHandler = vi.fn((req: Request, res: Response) => {
    res.status(200).json({ data: { read: true } });
  });

  // Test-only app: same middleware chain as production, plus throw-away routes.
  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser());
  testApp.use(requestIdMiddleware);
  testApp.use(loadSession);
  testApp.post('/api/test/mutation', requireAuth, requireCsrf, mutationHandler);
  testApp.get('/api/test/read', requireAuth, requireCsrf, readHandler);
  testApp.use(errorHandler);

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
    await resetAndSeed();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany({});
    mutationHandler.mockClear();
    readHandler.mockClear();
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.$disconnect();
  });

  it('SEC-002: logout without X-CSRF-Token returns 403 FORBIDDEN and the session stays valid', async () => {
    const session = await login(app, CUSTOMER1.email);

    const res = await request(app).post('/api/auth/logout').set('Cookie', session.cookieHeader);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: expect.any(String), requestId: expect.any(String) },
    });
    expect(res.body.error.message).not.toContain(session.csrfToken);

    expect(await prisma.session.count({ where: { tokenHash: hashSessionToken(session.sessionToken) } })).toBe(1);
    expect((await request(app).get('/api/auth/me').set('Cookie', session.cookieHeader)).status).toBe(200);
  });

  it('SEC-002: logout with a wrong token returns 403; with the correct token returns 204', async () => {
    const session = await login(app, CUSTOMER1.email);

    const wrong = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', `${session.csrfToken}x`);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('FORBIDDEN');

    const otherUser = await login(app, 'customer2@example.com');
    const otherToken = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', otherUser.csrfToken);
    expect(otherToken.status).toBe(403);

    const correct = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken);
    expect(correct.status).toBe(204);
  });

  it('SEC-002: the mutation handler is not invoked when the token is missing or wrong', async () => {
    const session = await login(app, CUSTOMER1.email);

    const missing = await request(testApp).post('/api/test/mutation').set('Cookie', session.cookieHeader).send({});
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('FORBIDDEN');

    const wrong = await request(testApp)
      .post('/api/test/mutation')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', 'not-the-token')
      .send({});
    expect(wrong.status).toBe(403);
    expect(mutationHandler).not.toHaveBeenCalled();

    const ok = await request(testApp)
      .post('/api/test/mutation')
      .set('Cookie', session.cookieHeader)
      .set('X-CSRF-Token', session.csrfToken)
      .send({});
    expect(ok.status).toBe(200);
    expect(mutationHandler).toHaveBeenCalledTimes(1);
  });

  it('SEC-002: an anonymous mutation gets 401 (authentication is checked before CSRF)', async () => {
    const res = await request(testApp).post('/api/test/mutation').set('X-CSRF-Token', 'anything').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(mutationHandler).not.toHaveBeenCalled();
  });

  it('SEC-002: GET requests need no CSRF token', async () => {
    const session = await login(app, CUSTOMER1.email);
    const res = await request(testApp).get('/api/test/read').set('Cookie', `qms_session=${session.sessionToken}`);
    expect(res.status).toBe(200);
    expect(readHandler).toHaveBeenCalledTimes(1);

    const me = await request(app).get('/api/auth/me').set('Cookie', `qms_session=${session.sessionToken}`);
    expect(me.status).toBe(200);
  });

  it('SEC-002: login needs no CSRF token', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: CUSTOMER1.email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
  });
});
