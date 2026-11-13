import { render } from '@testing-library/react';
import { ROUTER_FUTURE_FLAGS } from '../routerFlags';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi, type Mock } from 'vitest';
import { App } from '../App';

export type RouteHandler = (init: RequestInit) => Response | Promise<Response>;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function errorResponse(status: number, code: string, message = 'Request failed.'): Response {
  return jsonResponse(status, { error: { code, message, requestId: 'test-request-id' } });
}

export const CUSTOMER = { id: '11111111-1111-4111-8111-111111111111', email: 'customer1@example.com', role: 'CUSTOMER' };
export const OPERATOR = { id: '33333333-3333-4333-8333-333333333333', email: 'operator1@example.com', role: 'OPERATOR' };

export const OPEN_QUEUE = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'General Inquiry Desk',
  description: 'Walk-in help for general questions',
  availability: 'OPEN',
};
export const SECOND_QUEUE = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Document Pickup',
  description: 'Collect prepared documents',
  availability: 'OPEN',
};
/** Not returned by GET /api/queues (e.g. closed after the customer joined). */
export const UNLISTED_QUEUE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export const ENTRY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

/** A QueueEntry as returned by the API (api-spec §3.3); override any field. */
export function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    serviceQueueId: OPEN_QUEUE.id,
    customerId: CUSTOMER.id,
    queueNumber: 12,
    status: 'WAITING',
    joinedAt: '2026-11-09T09:00:00.000Z',
    calledAt: null,
    serviceStartedAt: null,
    completedAt: null,
    ...overrides,
  };
}

export const queuesResponse = (queues: unknown[]) => jsonResponse(200, { data: { queues } });
export const entriesResponse = (entries: unknown[]) => jsonResponse(200, { data: { entries } });
export const entryResponse = (entry: unknown, status = 200) => jsonResponse(status, { data: { entry } });

/**
 * Replaces global fetch with a router keyed by "METHOD /path". Unmatched requests fail the test.
 * `/api/auth/me` defaults to 401 (anonymous visitor) unless overridden. The two customer list
 * endpoints default to empty lists so screens that load them render neutrally.
 */
export function mockApi(routes: Record<string, RouteHandler>): Mock {
  const handlers: Record<string, RouteHandler> = {
    'GET /api/auth/me': () => errorResponse(401, 'UNAUTHORIZED', 'Authentication is required.'),
    'GET /api/queues': () => queuesResponse([]),
    'GET /api/me/queue-entries': () => entriesResponse([]),
    'GET /api/operator/queues': () => queuesResponse([]),
    ...routes,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const key = `${(init.method ?? 'GET').toUpperCase()} ${String(input)}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function callsTo(fetchMock: Mock, method: string, path: string): RequestInit[] {
  return fetchMock.mock.calls
    .filter(([input, init]) => String(input) === path && ((init as RequestInit)?.method ?? 'GET') === method)
    .map(([, init]) => init as RequestInit);
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

export function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]} future={ROUTER_FUTURE_FLAGS}>
      <App />
      <LocationProbe />
    </MemoryRouter>
  );
}
