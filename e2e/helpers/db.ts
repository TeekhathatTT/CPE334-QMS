/**
 * Direct access to the isolated test database for resetting data and for asserting DB state in
 * E2E tests. Only ever connects to TEST_DATABASE_URL (guarded in env.ts).
 */
import { PrismaClient } from '@prisma/client';
import { loadE2eEnv, pointProcessAtTestDb } from './env';

export const OPEN_QUEUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const CLOSED_QUEUE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const CUSTOMER1 = { id: '11111111-1111-4111-8111-111111111111', email: 'customer1@example.com' };
export const CUSTOMER2 = { id: '22222222-2222-4222-8222-222222222222', email: 'customer2@example.com' };
export const OPERATOR1 = { id: '33333333-3333-4333-8333-333333333333', email: 'operator1@example.com' };
export const OPERATOR2 = { id: '44444444-4444-4444-8444-444444444444', email: 'operator2@example.com' };
/** Dev-only seed password (server/prisma/seed.ts, README). */
export const SEED_PASSWORD = 'Password123!';

let client: PrismaClient | undefined;

export function testDb(): PrismaClient {
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: loadE2eEnv().TEST_DATABASE_URL } } });
  }
  return client;
}

/** Deletes every row and re-applies the project seed (same order as server/tests/helpers/auth.ts). */
export async function resetDatabase(): Promise<void> {
  pointProcessAtTestDb();
  // Imported lazily so server/src/db.ts is evaluated only after the process points at the test DB.
  const { seed } = await import('../../server/prisma/seed');
  const db = testDb();
  await db.session.deleteMany({});
  await db.queueEntry.deleteMany({});
  await db.operatorAssignment.deleteMany({});
  await db.serviceQueue.deleteMany({});
  await db.user.deleteMany({});
  await seed(db);
}

/** Invalidates every session server-side (simulates expiry / revocation mid-use). */
export async function deleteAllSessions(): Promise<void> {
  await testDb().session.deleteMany({});
}

export async function disconnectDb(): Promise<void> {
  if (client) await client.$disconnect();
  client = undefined;
}
