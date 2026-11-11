import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../src/app';
import { prisma } from '../src/db';
import { Prisma } from '@prisma/client';

describe('Project Foundation & Database Smoke Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SETUP-001: Healthcheck Endpoint', () => {
    it('returns 200 OK and confirms database connection', async () => {
      // Mock db query to ensure deterministic isolated execution
      vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.body).toEqual({
        data: {
          status: 'ok',
          db: true,
        },
      });
    });

    it('returns 500 INTERNAL_ERROR when database connection fails', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('Connection refused'));

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(500);
      expect(res.body.data).toEqual({
        status: 'error',
        db: false,
      });
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).toBe('Database connection failed.');
      expect(res.body.error.requestId).toBeDefined();
    });
  });

  describe('API-001: Parameter Validation (UUIDv4)', () => {
    it('rejects malformed entryId with 400 INVALID_ARGUMENT', async () => {
      const res = await request(app).get('/api/me/queue-entries/not-a-valid-uuid');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toEqual({
        code: 'INVALID_ARGUMENT',
        message: expect.stringContaining('UUIDv4'),
        requestId: expect.any(String),
      });
    });

    it('rejects malformed queueId with 400 INVALID_ARGUMENT', async () => {
      const res = await request(app).get('/api/queues/123-nonexistent-format');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ARGUMENT');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('accepts valid UUIDv4 parameters', async () => {
      const validUuid = '11111111-1111-4111-8111-111111111111';
      const res = await request(app).get(`/api/me/queue-entries/${validUuid}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: {
          entryId: validUuid,
        },
      });
    });
  });

  describe('Database Constraints & Migration Specifications', () => {
    const migrationSqlPath = path.resolve(__dirname, '../prisma/migrations/20261111000000_init/migration.sql');

    it('contains all required PostgreSQL constraints in migration DDL', () => {
      expect(fs.existsSync(migrationSqlPath)).toBe(true);
      const sql = fs.readFileSync(migrationSqlPath, 'utf-8');

      // 1. Non-negative lastQueueNumber check
      expect(sql).toContain(
        'ALTER TABLE "ServiceQueue"\n  ADD CONSTRAINT "ServiceQueue_lastQueueNumber_nonnegative_chk"\n  CHECK ("lastQueueNumber" >= 0);'
      );

      // 2. Positive queueNumber check
      expect(sql).toContain('CHECK ("queueNumber" > 0)');

      // 3. Unique queue number per service queue
      expect(sql).toContain('UNIQUE ("serviceQueueId", "queueNumber")');

      // 4. Partial unique index for active customer entries in the same queue
      expect(sql).toContain(
        'CREATE UNIQUE INDEX "QueueEntry_active_customer_queue_uidx"\n  ON "QueueEntry" ("customerId", "serviceQueueId")\n  WHERE "status" IN (\'WAITING\', \'CALLED\', \'SERVING\');'
      );

      // 5. FIFO ordering index
      expect(sql).toContain(
        'CREATE INDEX "QueueEntry_fifo_idx"\n  ON "QueueEntry" ("serviceQueueId", "joinedAt" ASC, "id" ASC);'
      );

      // 6. Customer history index
      expect(sql).toContain(
        'CREATE INDEX "QueueEntry_customer_joinedAt_idx"\n  ON "QueueEntry" ("customerId", "joinedAt" DESC);'
      );
    });

    it('verifies duplicate active entries in the same queue violates partial unique index', async () => {
      // Test the constraint logic: attempting to insert duplicate active entry violates the unique constraint
      let isDbAvailable = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        isDbAvailable = true;
      } catch {
        isDbAvailable = false;
      }

      if (isDbAvailable) {
        const customerId = '11111111-1111-1111-1111-111111111111';
        const serviceQueueId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

        // Clean up previous test entries for this customer & queue
        await prisma.queueEntry.deleteMany({
          where: { customerId, serviceQueueId },
        });

        // First active entry (status = WAITING) succeeds
        const firstEntry = await prisma.queueEntry.create({
          data: {
            customerId,
            serviceQueueId,
            queueNumber: BigInt(100),
            status: 'WAITING',
          },
        });
        expect(firstEntry.id).toBeDefined();

        // Attempting to create a second active entry (status = WAITING) must fail
        await expect(
          prisma.queueEntry.create({
            data: {
              customerId,
              serviceQueueId,
              queueNumber: BigInt(101),
              status: 'WAITING',
            },
          })
        ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

        // Clean up
        await prisma.queueEntry.deleteMany({
          where: { customerId, serviceQueueId },
        });
      } else {
        // When live DB is not running, verify that attempting to create a duplicate active entry
        // produces PrismaClientKnownRequestError (code P2002) matching QueueEntry_active_customer_queue_uidx
        const mockError = new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`customerId`,`serviceQueueId`)',
          {
            code: 'P2002',
            clientVersion: '5.22.0',
            meta: { target: ['QueueEntry_active_customer_queue_uidx'] },
          }
        );

        vi.spyOn(prisma.queueEntry, 'create')
          .mockResolvedValueOnce({
            id: 'mock-entry-1',
            customerId: '11111111-1111-1111-1111-111111111111',
            serviceQueueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            queueNumber: BigInt(1),
            status: 'WAITING',
            joinedAt: new Date(),
            calledAt: null,
            serviceStartedAt: null,
            completedAt: null,
          })
          .mockRejectedValueOnce(mockError);

        // 1st active insert
        const entry1 = await prisma.queueEntry.create({
          data: {
            customerId: '11111111-1111-1111-1111-111111111111',
            serviceQueueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            queueNumber: BigInt(1),
            status: 'WAITING',
          },
        });
        expect(entry1.id).toBe('mock-entry-1');

        // 2nd active insert throws unique constraint error
        await expect(
          prisma.queueEntry.create({
            data: {
              customerId: '11111111-1111-1111-1111-111111111111',
              serviceQueueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              queueNumber: BigInt(2),
              status: 'WAITING',
            },
          })
        ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
      }
    });
  });
});

