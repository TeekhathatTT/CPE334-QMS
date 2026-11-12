import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../src/db';
import { seed } from '../prisma/seed';
import { requestIdMiddleware } from '../src/middleware/requestId';
import { requestLogger } from '../src/middleware/requestLogger';
import { errorHandler } from '../src/middleware/errorHandler';
import { validateUuidParam } from '../src/middleware/validateUuid';
import { validateRequest } from '../src/middleware/validateRequest';
import { requireAuth, requireRole } from '../src/middleware/auth';
import { Role } from '@prisma/client';

describe('Project Foundation & Database Integration Tests', () => {
  // Test-only Express wrapper to mount and verify middleware without polluting production app.ts
  const createTestApp = () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(requestIdMiddleware);
    testApp.use(requestLogger);

    testApp.param('queueId', validateUuidParam('queueId'));
    testApp.param('entryId', validateUuidParam('entryId'));

    // Test routes for API-001 UUIDv4 validation
    testApp.get('/api/me/queue-entries/:entryId', (req: Request, res: Response) => {
      res.status(200).json({ data: { entryId: req.params.entryId } });
    });

    testApp.get('/api/queues/:queueId', (req: Request, res: Response) => {
      res.status(200).json({ data: { queueId: req.params.queueId } });
    });

    // Test route for Request Validation middleware
    const sampleBodySchema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
    });
    const sampleQuerySchema = z.object({
      filter: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    });

    testApp.post(
      '/api/test/validation',
      validateRequest({ body: sampleBodySchema, query: sampleQuerySchema }),
      (req: Request, res: Response) => {
        res.status(200).json({ data: { body: req.body, query: req.query } });
      }
    );

    // Test routes for Auth & RBAC middleware
    testApp.get(
      '/api/test/protected',
      (req, res, next) => {
        // Mock auth header for testing
        const role = req.headers['x-mock-role'] as Role | undefined;
        if (role) {
          req.user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', role };
        }
        next();
      },
      requireAuth,
      (req: Request, res: Response) => {
        res.status(200).json({ data: { user: req.user } });
      }
    );

    testApp.get(
      '/api/test/operator-only',
      (req, res, next) => {
        const role = req.headers['x-mock-role'] as Role | undefined;
        if (role) {
          req.user = { id: '33333333-3333-4333-8333-333333333333', email: 'op@example.com', role };
        }
        next();
      },
      requireRole(Role.OPERATOR),
      (req: Request, res: Response) => {
        res.status(200).json({ data: { success: true } });
      }
    );

    testApp.use(errorHandler);
    return testApp;
  };

  const testApp = createTestApp();

  beforeAll(async () => {
    // Fail loudly if real test database is unreachable
    await prisma.$queryRaw`SELECT 1`;

    // Ensure database has clean seeded baseline
    await prisma.queueEntry.deleteMany({});
    await prisma.operatorAssignment.deleteMany({});
    await prisma.serviceQueue.deleteMany({});
    await prisma.user.deleteMany({});
    await seed(prisma);
  });

  afterAll(async () => {
    await prisma.queueEntry.deleteMany({});
    await prisma.$disconnect();
  });

  describe('API-001: Path Parameter Validation (UUIDv4)', () => {
    it('rejects malformed entryId with 400 INVALID_ARGUMENT (standard error envelope only)', async () => {
      const res = await request(testApp).get('/api/me/queue-entries/not-a-valid-uuid');

      expect(res.status).toBe(400);
      expect(res.body.data).toBeUndefined(); // Never returns both data and error (SDS §5.3)
      expect(res.body.error).toBeDefined();
      expect(res.body.error).toEqual({
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('UUIDv4'),
        requestId: expect.any(String),
      });
    });

    it('rejects malformed queueId with 400 INVALID_ARGUMENT', async () => {
      const res = await request(testApp).get('/api/queues/nonexistent-uuid-123');

      expect(res.status).toBe(400);
      expect(res.body.data).toBeUndefined();
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('accepts valid RFC 4122 UUIDv4 parameters', async () => {
      const validUuid = '11111111-1111-4111-8111-111111111111';
      const res = await request(testApp).get(`/api/me/queue-entries/${validUuid}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: {
          entryId: validUuid,
        },
      });
    });
  });

  describe('Request Body & Query Validation Middleware (Zod)', () => {
    it('rejects missing or malformed body fields with 400 INVALID_ARGUMENT', async () => {
      const res = await request(testApp)
        .post('/api/test/validation')
        .send({ email: 'not-an-email', name: 'A' });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeUndefined();
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
      expect(res.body.error.message).toContain('email');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('rejects invalid query parameter enum with 400 INVALID_ARGUMENT', async () => {
      const res = await request(testApp)
        .post('/api/test/validation?filter=UNKNOWN')
        .send({ email: 'test@example.com', name: 'Valid Name' });

      expect(res.status).toBe(400);
      expect(res.body.data).toBeUndefined();
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
    });

    it('accepts valid body and query parameters', async () => {
      const res = await request(testApp)
        .post('/api/test/validation?filter=ACTIVE')
        .send({ email: 'valid@example.com', name: 'Valid User' });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.body.email).toBe('valid@example.com');
      expect(res.body.data.query.filter).toBe('ACTIVE');
    });
  });

  describe('Auth & RBAC Middleware Skeleton', () => {
    it('returns 401 UNAUTHORIZED when session user is missing', async () => {
      const res = await request(testApp).get('/api/test/protected');

      expect(res.status).toBe(401);
      expect(res.body.data).toBeUndefined();
      expect(res.body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Authentication is required.',
        requestId: expect.any(String),
      });
    });

    it('returns 200 OK when session user is authenticated', async () => {
      const res = await request(testApp)
        .get('/api/test/protected')
        .set('x-mock-role', 'CUSTOMER');

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('CUSTOMER');
    });

    it('returns 403 FORBIDDEN when user lacks required role', async () => {
      const res = await request(testApp)
        .get('/api/test/operator-only')
        .set('x-mock-role', 'CUSTOMER');

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
      expect(res.body.error).toEqual({
        code: 'FORBIDDEN',
        message: expect.any(String),
        requestId: expect.any(String),
      });
    });

    it('returns 200 OK when user matches required role', async () => {
      const res = await request(testApp)
        .get('/api/test/operator-only')
        .set('x-mock-role', 'OPERATOR');

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });
  });

  describe('Real PostgreSQL Constraints & DDL Verification', () => {
    const migrationSqlPath = path.resolve(__dirname, '../prisma/migrations/20261111000000_init/migration.sql');
    const customerId = '11111111-1111-4111-8111-111111111111';
    const serviceQueueId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    it('migration file exists and contains all required checks, unique keys, and partial indexes', () => {
      expect(fs.existsSync(migrationSqlPath)).toBe(true);
      const sql = fs.readFileSync(migrationSqlPath, 'utf-8');

      expect(sql).toContain('CHECK ("lastQueueNumber" >= 0)');
      expect(sql).toContain('CHECK ("queueNumber" > 0)');
      expect(sql).toContain('UNIQUE ("serviceQueueId", "queueNumber")');
      expect(sql).toContain('CREATE UNIQUE INDEX "QueueEntry_active_customer_queue_uidx"');
      expect(sql).toContain('WHERE "status" IN (\'WAITING\', \'CALLED\', \'SERVING\')');
      expect(sql).toContain('CREATE INDEX "QueueEntry_fifo_idx"');
      expect(sql).toContain('CREATE INDEX "QueueEntry_customer_joinedAt_idx"');
    });

    it('enforces partial unique index: duplicate active join in the same queue is rejected by the database', async () => {
      await prisma.queueEntry.deleteMany({ where: { customerId, serviceQueueId } });

      // 1. First active entry (WAITING) succeeds
      const entry1 = await prisma.queueEntry.create({
        data: {
          customerId,
          serviceQueueId,
          queueNumber: BigInt(1),
          status: 'WAITING',
        },
      });
      expect(entry1.id).toBeDefined();

      // 2. Attempting second active entry (WAITING) for same customer & queue violates partial unique index
      await expect(
        prisma.queueEntry.create({
          data: {
            customerId,
            serviceQueueId,
            queueNumber: BigInt(2),
            status: 'WAITING',
          },
        })
      ).rejects.toThrow();

      // 3. Attempting second active entry with CALLED status also violates partial unique index
      await expect(
        prisma.queueEntry.create({
          data: {
            customerId,
            serviceQueueId,
            queueNumber: BigInt(3),
            status: 'CALLED',
          },
        })
      ).rejects.toThrow();

      // Clean up
      await prisma.queueEntry.deleteMany({ where: { customerId, serviceQueueId } });
    });

    it('permits rejoin after previous entry is COMPLETED (QUEUE-005)', async () => {
      await prisma.queueEntry.deleteMany({ where: { customerId, serviceQueueId } });

      // 1. Initial entry completed
      await prisma.queueEntry.create({
        data: {
          customerId,
          serviceQueueId,
          queueNumber: BigInt(10),
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // 2. Rejoin with active status WAITING succeeds because COMPLETED is excluded from the partial index
      const rejoinEntry = await prisma.queueEntry.create({
        data: {
          customerId,
          serviceQueueId,
          queueNumber: BigInt(11),
          status: 'WAITING',
        },
      });
      expect(rejoinEntry.id).toBeDefined();

      await prisma.queueEntry.deleteMany({ where: { customerId, serviceQueueId } });
    });

    it('enforces CHECK constraint: ServiceQueue.lastQueueNumber cannot be negative', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "ServiceQueue" ("id", "name", "availability", "lastQueueNumber", "updatedAt")
           VALUES (gen_random_uuid(), 'Invalid Queue', 'OPEN', -1, CURRENT_TIMESTAMP)`
        )
      ).rejects.toThrow();
    });

    it('enforces CHECK constraint: QueueEntry.queueNumber must be strictly positive (> 0)', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "QueueEntry" ("id", "customerId", "serviceQueueId", "queueNumber", "status", "updatedAt")
           VALUES (gen_random_uuid(), '${customerId}', '${serviceQueueId}', 0, 'WAITING', CURRENT_TIMESTAMP)`
        )
      ).rejects.toThrow();
    });

    it('enforces UNIQUE constraint on (serviceQueueId, queueNumber)', async () => {
      await prisma.queueEntry.deleteMany({ where: { serviceQueueId } });

      const customer2Id = '22222222-2222-4222-8222-222222222222';

      // Customer 1 takes queue number 50
      await prisma.queueEntry.create({
        data: {
          customerId,
          serviceQueueId,
          queueNumber: BigInt(50),
          status: 'WAITING',
        },
      });

      // Customer 2 attempts to take duplicate queue number 50 in the same queue
      await expect(
        prisma.queueEntry.create({
          data: {
            customerId: customer2Id,
            serviceQueueId,
            queueNumber: BigInt(50),
            status: 'WAITING',
          },
        })
      ).rejects.toThrow();

      await prisma.queueEntry.deleteMany({ where: { serviceQueueId } });
    });
  });
});
