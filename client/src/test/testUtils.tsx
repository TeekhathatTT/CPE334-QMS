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

/**
 * Replaces global fetch with a router keyed by "METHOD /path". Unmatched requests fail the test.
 * `/api/auth/me` defaults to 401 (anonymous visitor) unless overridden.
 */
export function mockApi(routes: Record<string, RouteHandler>): Mock {
  const handlers: Record<string, RouteHandler> = {
    'GET /api/auth/me': () => errorResponse(401, 'UNAUTHORIZED', 'Authentication is required.'),
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
