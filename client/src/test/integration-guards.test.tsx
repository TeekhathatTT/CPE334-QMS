/**
 * Issue #7 — client gaps only (see docs/sprints/sprint-1/evidence/issue7-coverage.md).
 * Existing suites assert the session-expired flow for customer screens and the role redirects for
 * `/customer` and `/operator`. Not yet asserted, and added here:
 *   - the session-expired flow (ui-spec §7) on the operator screens (initial load and an action)
 *   - an operator opening a customer detail URL, and anonymous access to both detail routes
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ENTRY_ID,
  OPEN_QUEUE,
  OPERATOR,
  callsTo,
  entriesResponse,
  errorResponse,
  jsonResponse,
  makeEntry,
  mockApi,
  queuesResponse,
  renderApp,
} from './testUtils';

const SESSION_EXPIRED = 'Session expired. Please sign in again.';
const location = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  document.cookie = 'qms_csrf=operator-csrf-token; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Session expiry on operator screens (ui-spec §7)', () => {
  it('a 401 while loading /operator/queues/:id clears the user, goes to /login, and shows the exact banner', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () =>
        errorResponse(401, 'UNAUTHORIZED', 'Authentication is required.'),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByRole('status')).toHaveTextContent(SESSION_EXPIRED);
    expect(screen.queryByText(OPERATOR.email)).not.toBeInTheDocument();
    expect(screen.queryByText('Authentication is required.')).not.toBeInTheDocument();
  });

  it('a 401 on Call Next sends the operator to /login with the banner instead of an action error', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () =>
        entriesResponse([makeEntry({ customerId: 'cccccccc-0000-4000-8000-000000000001' })]),
      [`POST /api/operator/queues/${OPEN_QUEUE.id}/call-next`]: () =>
        errorResponse(401, 'UNAUTHORIZED', 'Authentication is required.'),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Call Next' }));

    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByRole('status')).toHaveTextContent(SESSION_EXPIRED);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', `/api/operator/queues/${OPEN_QUEUE.id}/call-next`)).toHaveLength(1);
  });

  it('a 401 on the operator dashboard load also uses the session-expired flow', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => errorResponse(401, 'UNAUTHORIZED', 'Authentication is required.'),
    });

    renderApp('/operator');

    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByRole('status')).toHaveTextContent(SESSION_EXPIRED);
  });
});

describe('Route guards not covered elsewhere', () => {
  it('an operator opening a customer entry URL is sent to /operator without any customer API call', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
    });

    renderApp(`/customer/entries/${ENTRY_ID}`);

    await waitFor(() => expect(location()).toBe('/operator'));
    expect(callsTo(fetchMock, 'GET', `/api/me/queue-entries/${ENTRY_ID}`)).toHaveLength(0);
    expect(callsTo(fetchMock, 'GET', '/api/me/queue-entries')).toHaveLength(0);
  });

  it.each([`/operator/queues/${OPEN_QUEUE.id}`, `/customer/entries/${ENTRY_ID}`])(
    'an anonymous visitor to %s goes to /login without the banner and without calling the protected API',
    async (path) => {
      const fetchMock = mockApi({});

      renderApp(path);

      await waitFor(() => expect(location()).toBe('/login'));
      expect(screen.queryByText(SESSION_EXPIRED)).not.toBeInTheDocument();
      // Only the anonymous /api/auth/me probe is sent.
      expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(['/api/auth/me']);
    }
  );
});
