import request, { Response } from 'supertest';
import type { Express } from 'express';
import { prisma } from '../../src/db';
import { seed } from '../../prisma/seed';

export const SEED_PASSWORD = 'Password123!';
export const CUSTOMER1 = { id: '11111111-1111-4111-8111-111111111111', email: 'customer1@example.com' };
export const CUSTOMER2 = { id: '22222222-2222-4222-8222-222222222222', email: 'customer2@example.com' };
export const OPERATOR1 = { id: '33333333-3333-4333-8333-333333333333', email: 'operator1@example.com' };
export const OPERATOR2 = { id: '44444444-4444-4444-8444-444444444444', email: 'operator2@example.com' };
export const OPEN_QUEUE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const CLOSED_QUEUE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Clears every table in the isolated test database and re-applies the seed. */
export async function resetAndSeed(): Promise<void> {
  await prisma.session.deleteMany({});
  await prisma.queueEntry.deleteMany({});
  await prisma.operatorAssignment.deleteMany({});
  await prisma.serviceQueue.deleteMany({});
  await prisma.user.deleteMany({});
  await seed(prisma);
}

export interface SetCookie {
  value: string;
  /** Lower-cased attribute list, e.g. ["path=/", "httponly", "samesite=lax"]. */
  attributes: string[];
}

export function getSetCookie(res: Response, name: string): SetCookie | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const raw = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) return undefined;
  const [pair, ...attributes] = raw.split(';').map((part) => part.trim());
  return {
    value: decodeURIComponent(pair.slice(name.length + 1)),
    attributes: attributes.map((attribute) => attribute.toLowerCase()),
  };
}

export interface LoggedIn {
  res: Response;
  sessionToken: string;
  csrfToken: string;
  /** Value for a `Cookie` request header carrying both cookies. */
  cookieHeader: string;
}

export async function login(app: Express, email: string, password = SEED_PASSWORD): Promise<LoggedIn> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login for ${email} failed with ${res.status}`);
  }
  const session = getSetCookie(res, 'qms_session');
  const csrf = getSetCookie(res, 'qms_csrf');
  if (!session || !csrf) {
    throw new Error('login did not set both cookies');
  }
  return {
    res,
    sessionToken: session.value,
    csrfToken: csrf.value,
    cookieHeader: `qms_session=${session.value}; qms_csrf=${csrf.value}`,
  };
}

/** Strips the per-request requestId so error bodies can be compared for equality. */
export function withoutRequestId(body: { error?: Record<string, unknown> }): unknown {
  if (!body.error) return body;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { requestId, ...rest } = body.error;
  return { error: rest };
}
