import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { Role } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { requestIdMiddleware } from '../src/middleware/requestId';
import { loadSession } from '../src/middleware/session';
import { requireAuth, requireRole } from '../src/middleware/auth';
import { requireQueueAssignment } from '../src/middleware/queueAssignment';
import { validateUuidParam } from '../src/middleware/validateUuid';
import { errorHandler } from '../src/middleware/errorHandler';
import { CLOSED_QUEUE_ID, CUSTOMER1, OPEN_QUEUE_ID, OPERATOR1, OPERATOR2, login, resetAndSeed } from './helpers/auth';

/**
 * Middleware-level checks with real sessions. These do NOT replace RBAC-001 to RBAC-004, which
 * run against the real operator endpoints in Issue #6.
 */
describe('RBAC middleware with real sessions (test-only routes)', () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(cookieParser());
  testApp.use(requestIdMiddleware);
  testApp.use(loadSession);
  const router = express.Router();
  router.param('queueId', validateUuidParam('queueId'));
  router.get('/protected', requireAuth, (req: Request, res: Response) => {
    res.status(200).json({ data: { user: req.user } });
  });
  router.get('/operator-only', requireAuth, requireRole(Role.OPERATOR), (req: Request, res: Response) => {
    res.status(200).json({ data: { ok: true } });
  });
  router.get(
    '/queues/:queueId',
    requireAuth,
    requireRole(Role.OPERATOR),
    requireQueueAssignment,
    (req: Request, res: Response) => {
      res.status(200).json({ data: { queueId: req.params.queueId } });
    }
  );
  testApp.use('/api/test', router);
  testApp.use(errorHandler);

  let customerCookie: string;
  let operator1Cookie: string;
  let operator2Cookie: string;

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
    await resetAndSeed();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany({});
    customerCookie = (await login(app, CUSTOMER1.email)).cookieHeader;
    operator1Cookie = (await login(app, OPERATOR1.email)).cookieHeader;
    operator2Cookie = (await login(app, OPERATOR2.email)).cookieHeader;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.$disconnect();
  });

  it('unauthenticated request to a protected route returns 401 UNAUTHORIZED', async () => {
    const res = await request(testApp).get('/api/test/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('loadSession sets req.user from a real session (id, email, role only)', async () => {
    const res = await request(testApp).get('/api/test/protected').set('Cookie', customerCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({ id: CUSTOMER1.id, email: CUSTOMER1.email, role: 'CUSTOMER' });
  });

  it('customer on an operator-only route returns 403 FORBIDDEN', async () => {
    const res = await request(testApp).get('/api/test/operator-only').set('Cookie', customerCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('operator on an operator-only route is allowed', async () => {
    const res = await request(testApp).get('/api/test/operator-only').set('Cookie', operator1Cookie);
    expect(res.status).toBe(200);
  });

  describe('requireQueueAssignment', () => {
    it('assigned operator passes', async () => {
      const res = await request(testApp).get(`/api/test/queues/${OPEN_QUEUE_ID}`).set('Cookie', operator1Cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.queueId).toBe(OPEN_QUEUE_ID);
    });

    it('operator not assigned to an existing queue gets 403 FORBIDDEN', async () => {
      const unassignedQueue = await request(testApp)
        .get(`/api/test/queues/${CLOSED_QUEUE_ID}`)
        .set('Cookie', operator1Cookie);
      expect(unassignedQueue.status).toBe(403);
      expect(unassignedQueue.body.error.code).toBe('FORBIDDEN');

      const unassignedOperator = await request(testApp)
        .get(`/api/test/queues/${OPEN_QUEUE_ID}`)
        .set('Cookie', operator2Cookie);
      expect(unassignedOperator.status).toBe(403);
      expect(unassignedOperator.body.error.code).toBe('FORBIDDEN');
    });

    it('unknown queue returns 404 RESOURCE_NOT_FOUND', async () => {
      const res = await request(testApp)
        .get('/api/test/queues/cccccccc-cccc-4ccc-8ccc-cccccccccccc')
        .set('Cookie', operator1Cookie);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('customer is rejected with 403 before any queue lookup', async () => {
      const res = await request(testApp).get(`/api/test/queues/${OPEN_QUEUE_ID}`).set('Cookie', customerCookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('requireQueueAssignment rejects a non-operator even when mounted without requireRole', async () => {
      const bare = express();
      bare.use(cookieParser());
      bare.use(requestIdMiddleware);
      bare.use(loadSession);
      bare.get('/q/:queueId', requireAuth, requireQueueAssignment, (req: Request, res: Response) => {
        res.status(200).end();
      });
      bare.use(errorHandler);
      const res = await request(bare).get(`/q/${OPEN_QUEUE_ID}`).set('Cookie', customerCookie);
      expect(res.status).toBe(403);
    });
  });
});
