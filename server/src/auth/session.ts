import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { CookieOptions } from 'express';
import { AccountStatus, Role } from '@prisma/client';
import { prisma } from '../db';

/** Absolute session lifetime (Issue #3 decision): 8 hours from login, not extended by activity. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'qms_session';
export const CSRF_COOKIE = 'qms_csrf';

// Raw tokens are 32 random bytes in base64url (43 chars). Anything far longer is rejected
// before hashing so oversized cookies cannot be used to burn CPU.
const MAX_TOKEN_LENGTH = 128;

export interface ActiveSession {
  id: string;
  csrfToken: string;
  expiresAt: Date;
  user: { id: string; email: string; role: Role };
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured.');
  }
  return secret;
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** HMAC-SHA256(SESSION_SECRET, rawToken) in hex. Only this value is stored in the database. */
export function hashSessionToken(rawToken: string): string {
  return createHmac('sha256', getSessionSecret()).update(rawToken).digest('hex');
}

/** Constant-time string comparison with an explicit length check. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createSession(
  userId: string
): Promise<{ rawToken: string; csrfToken: string; expiresAt: Date }> {
  const rawToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId, tokenHash: hashSessionToken(rawToken), csrfToken, expiresAt },
  });

  return { rawToken, csrfToken, expiresAt };
}

/**
 * Returns the session for a raw cookie token when it exists, has not expired, and belongs to an
 * ACTIVE user. Expired sessions are deleted when encountered.
 */
export async function findActiveSession(rawToken: unknown): Promise<ActiveSession | null> {
  if (typeof rawToken !== 'string' || rawToken.length === 0 || rawToken.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(rawToken) },
    include: { user: { select: { id: true, email: true, role: true, accountStatus: true } } },
  });
  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  if (session.user.accountStatus !== AccountStatus.ACTIVE) {
    return null;
  }

  return {
    id: session.id,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    user: { id: session.user.id, email: session.user.email, role: session.user.role },
  };
}

export async function deleteSessionById(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function deleteSessionByToken(rawToken: unknown): Promise<void> {
  if (typeof rawToken !== 'string' || rawToken.length === 0 || rawToken.length > MAX_TOKEN_LENGTH) {
    return;
  }
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(rawToken) } });
}

function baseCookieOptions(): CookieOptions {
  return {
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  };
}

/** `qms_session`: HttpOnly, never readable by page scripts. */
export function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return { ...baseCookieOptions(), httpOnly: true, maxAge: Math.max(0, expiresAt.getTime() - Date.now()) };
}

/** `qms_csrf`: same attributes but readable by the client so it can echo it in X-CSRF-Token. */
export function csrfCookieOptions(expiresAt: Date): CookieOptions {
  return { ...baseCookieOptions(), httpOnly: false, maxAge: Math.max(0, expiresAt.getTime() - Date.now()) };
}

export function clearCookieOptions(httpOnly: boolean): CookieOptions {
  return { ...baseCookieOptions(), httpOnly };
}
