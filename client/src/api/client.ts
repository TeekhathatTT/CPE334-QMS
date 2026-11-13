/**
 * Fetch wrapper for the QMS API.
 *
 * - Parses the `{ data }` / `{ error }` envelopes (api-spec §1).
 * - Sends `X-CSRF-Token` (read from the `qms_csrf` cookie) on every non-GET request (api-spec §4.3).
 * - Reports `401 UNAUTHORIZED` on authenticated requests to a session-expired handler (ui-spec §7).
 *   Requests to `/api/auth/login` never trigger that handler.
 */

export type Role = 'CUSTOMER' | 'OPERATOR';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export const CSRF_COOKIE = 'qms_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';
const LOGIN_PATH = '/api/auth/login';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly serverMessage?: string;

  constructor(status: number, code: string, message: string, serverMessage?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

let sessionExpiredHandler: (() => void) | null = null;

/** Registers the callback run when an authenticated request returns 401 UNAUTHORIZED. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }
  return null;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /**
   * Set for requests that are not made on behalf of a signed-in user (e.g. the initial
   * `/api/auth/me` probe), so a 401 there is not reported as an expired session.
   */
  anonymousProbe?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T | undefined> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) {
      headers[CSRF_HEADER] = csrfToken;
    }
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return undefined;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
    const serverMessage = typeof error?.message === 'string' ? error.message : undefined;
    // The server message is deliberately not surfaced; screens map codes to their own safe text.
    const apiError = new ApiError(
      response.status,
      code,
      `Request failed with status ${response.status}.`,
      serverMessage
    );

    if (response.status === 401 && code === 'UNAUTHORIZED' && path !== LOGIN_PATH && !options.anonymousProbe) {
      sessionExpiredHandler?.();
    }
    throw apiError;
  }

  return (payload as { data?: T } | null)?.data;
}

export const authApi = {
  async login(email: string, password: string): Promise<User> {
    const data = await apiRequest<{ user: User }>(LOGIN_PATH, { method: 'POST', body: { email, password } });
    if (!data?.user) throw new ApiError(500, 'INTERNAL_ERROR', 'Unexpected response.');
    return data.user;
  },

  async logout(): Promise<void> {
    await apiRequest<void>('/api/auth/logout', { method: 'POST' });
  },

  /** Returns the signed-in user, or null when there is no valid session. */
  async me(options: { anonymousProbe?: boolean } = {}): Promise<User | null> {
    try {
      const data = await apiRequest<{ user: User }>('/api/auth/me', { anonymousProbe: options.anonymousProbe });
      return data?.user ?? null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
};

export function homePathFor(role: Role): string {
  return role === 'OPERATOR' ? '/operator' : '/customer';
}
