import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CUSTOMER,
  ENTRY_ID,
  OPEN_QUEUE,
  UNLISTED_QUEUE_ID,
  callsTo,
  entryResponse,
  errorResponse,
  jsonResponse,
  makeEntry,
  mockApi,
  queuesResponse,
  renderApp,
  type RouteHandler,
} from './testUtils';

const SESSION_EXPIRED = 'Session expired. Please sign in again.';
const NOT_FOUND = "We couldn't find that queue entry.";
const DETAIL_PATH = `/api/me/queue-entries/${ENTRY_ID}`;
const location = () => screen.getByTestId('location').textContent;

function mockDetail(entry: () => Response | Promise<Response>, routes: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
    'GET /api/queues': () => queuesResponse([OPEN_QUEUE]),
    [`GET ${DETAIL_PATH}`]: entry,
    ...routes,
  });
}

let visibility: DocumentVisibilityState = 'visible';
function stubVisibility(state: DocumentVisibilityState) {
  visibility = state;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe('Entry detail', () => {
  it('shows queue number, queue name, status, joined time, and other set timestamps', async () => {
    mockDetail(() =>
      entryResponse(
        makeEntry({ status: 'SERVING', calledAt: '2026-11-09T09:10:00.000Z', serviceStartedAt: '2026-11-09T09:12:00.000Z', aheadCount: 0 })
      )
    );
    renderApp(`/customer/entries/${ENTRY_ID}`);

    expect(await screen.findByTestId('entry-queue-number')).toHaveTextContent(/^12$/);
    expect(await screen.findByRole('heading', { name: OPEN_QUEUE.name })).toBeInTheDocument();
    expect(screen.getByText('In service', { selector: '[data-status]' })).toBeInTheDocument();
    for (const [label, iso] of [
      ['Joined:', '2026-11-09T09:00:00.000Z'],
      ['Called:', '2026-11-09T09:10:00.000Z'],
      ['Service started:', '2026-11-09T09:12:00.000Z'],
    ]) {
      expect(screen.getByText(label).nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', iso);
    }
    expect(screen.queryByText('Completed:')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to my queues/ })).toHaveAttribute('href', '/customer');
  });

  it('falls back to "Service queue" when the queue is not in the OPEN list', async () => {
    mockDetail(() => entryResponse(makeEntry({ serviceQueueId: UNLISTED_QUEUE_ID, aheadCount: 0 })));
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByRole('heading', { name: 'Service queue' })).toBeInTheDocument();
  });

  it.each([
    [{ status: 'WAITING', aheadCount: 0 }, 'You are next'],
    [{ status: 'WAITING', aheadCount: 1 }, 'Currently waiting. 1 person ahead of you.'],
    [{ status: 'WAITING', aheadCount: 4 }, 'Currently waiting. 4 people ahead of you.'],
    [{ status: 'CALLED', aheadCount: 0, calledAt: '2026-11-09T09:10:00.000Z' }, 'Please go to the service desk.'],
    [{ status: 'SERVING', aheadCount: 0 }, 'Your service is in progress.'],
    [{ status: 'COMPLETED', aheadCount: 0, completedAt: '2026-11-09T09:30:00.000Z' }, 'Service completed.'],
  ])('shows the queue-specific message for %o', async (fields, message) => {
    mockDetail(() => entryResponse(makeEntry(fields)));
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByTestId('entry-message')).toHaveTextContent(new RegExp(`^${message.replace(/\./g, '\\.')}$`));
    if (fields.status !== 'WAITING') {
      expect(screen.queryByText(/ahead of you|You are next/)).not.toBeInTheDocument();
    }
  });

  it.each([
    ['a missing or cross-owner entry (404)', ENTRY_ID, 404, 'RESOURCE_NOT_FOUND'],
    ['a malformed id (400)', 'not-a-uuid', 400, 'INVALID_ARGUMENT'],
  ])('shows only the generic not-found message for %s (QUEUE-006, RBAC-005)', async (_label, id, status, code) => {
    mockDetail(() => errorResponse(404, 'RESOURCE_NOT_FOUND'), {
      [`GET /api/me/queue-entries/${id}`]: () => errorResponse(status, code, 'Queue entry owned by customer2 not found'),
    });
    renderApp(`/customer/entries/${id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_FOUND);
    expect(screen.getByRole('link', { name: /Back to my queues/ })).toHaveAttribute('href', '/customer');
    expect(screen.queryByText(/customer2/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('entry-queue-number')).not.toBeInTheDocument();
    expect(screen.queryByText(/Queue number/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting|Called|In service|Completed/)).not.toBeInTheDocument();
    expect(location()).toBe(`/customer/entries/${id}`);
  });

  it('shows a retryable error for other failures', async () => {
    let fail = true;
    mockDetail(() => (fail ? errorResponse(500, 'INTERNAL_ERROR', 'stack trace here') : entryResponse(makeEntry({ aheadCount: 0 }))));
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this queue entry. Please try again.");
    expect(screen.queryByText(/stack trace/)).not.toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('entry-message')).toHaveTextContent('You are next');
  });

  it('the Refresh button re-fetches the entry', async () => {
    const fetchMock = mockDetail(() => entryResponse(makeEntry({ aheadCount: 2 })));
    renderApp(`/customer/entries/${ENTRY_ID}`);
    await screen.findByTestId('entry-message');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(callsTo(fetchMock, 'GET', DETAIL_PATH)).toHaveLength(2));
  });
});

describe('Entry detail polling', () => {
  it('polls every 10 s, announces a status change, skips while hidden, and stops at COMPLETED', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    stubVisibility('visible');
    let fields: Record<string, unknown> = { status: 'WAITING', aheadCount: 1 };
    const fetchMock = mockDetail(() => entryResponse(makeEntry(fields)));
    renderApp(`/customer/entries/${ENTRY_ID}`);
    await screen.findByText('Currently waiting. 1 person ahead of you.');
    const calls = () => callsTo(fetchMock, 'GET', DETAIL_PATH).length;
    expect(calls()).toBe(1);

    fields = { status: 'WAITING', aheadCount: 0 };
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(await screen.findByText('You are next')).toBeInTheDocument();
    expect(calls()).toBe(2);

    stubVisibility('hidden');
    fields = { status: 'CALLED', aheadCount: 0, calledAt: '2026-11-09T09:10:00.000Z' };
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(calls()).toBe(2);

    stubVisibility('visible');
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(await screen.findByText('Please go to the service desk.')).toBeInTheDocument();
    expect(screen.getByTestId('status-announcer')).toHaveTextContent(
      `Queue number 12 in ${OPEN_QUEUE.name} is now Called. Please go to the service desk.`
    );

    fields = { status: 'COMPLETED', aheadCount: 0, completedAt: '2026-11-09T09:30:00.000Z' };
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(await screen.findByText('Service completed.')).toBeInTheDocument();
    expect(screen.getByTestId('status-announcer')).toHaveTextContent('is now Completed.');
    const atCompletion = calls();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(calls()).toBe(atCompletion);
  });

  it('does not poll a COMPLETED entry at all', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    stubVisibility('visible');
    const fetchMock = mockDetail(() =>
      entryResponse(makeEntry({ status: 'COMPLETED', aheadCount: 0, completedAt: '2026-11-09T09:30:00.000Z' }))
    );
    renderApp(`/customer/entries/${ENTRY_ID}`);
    await screen.findByText('Service completed.');
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(callsTo(fetchMock, 'GET', DETAIL_PATH)).toHaveLength(1);
  });

  it('keeps the entry and shows a retry note when a poll fails, then recovers', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    stubVisibility('visible');
    let fail = false;
    mockDetail(() => (fail ? errorResponse(503, 'INTERNAL_ERROR') : entryResponse(makeEntry({ aheadCount: 3 }))));
    renderApp(`/customer/entries/${ENTRY_ID}`);
    await screen.findByText('Currently waiting. 3 people ahead of you.');

    fail = true;
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(await screen.findByText('Could not refresh. Retrying...')).toBeInTheDocument();
    expect(screen.getByText('Currently waiting. 3 people ahead of you.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fail = false;
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await waitFor(() => expect(screen.queryByText('Could not refresh. Retrying...')).not.toBeInTheDocument());
  });

  it('a 401 during polling triggers the existing session-expired redirect', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    stubVisibility('visible');
    let expired = false;
    mockDetail(() => (expired ? errorResponse(401, 'UNAUTHORIZED') : entryResponse(makeEntry({ aheadCount: 0 }))));
    renderApp(`/customer/entries/${ENTRY_ID}`);
    await screen.findByText('You are next');

    expired = true;
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByText(SESSION_EXPIRED)).toBeInTheDocument();
    expect(screen.queryByText('You are next')).not.toBeInTheDocument();
  });

  it('stops polling on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    stubVisibility('visible');
    const fetchMock = mockDetail(() => entryResponse(makeEntry({ aheadCount: 0 })));
    const { unmount } = renderApp(`/customer/entries/${ENTRY_ID}`);
    await screen.findByText('You are next');
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(callsTo(fetchMock, 'GET', DETAIL_PATH)).toHaveLength(1);
  });
});
