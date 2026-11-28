/**
 * F-10 PRIO-014 (operator Priority badge, WAITING-only toggle, busy/live/error handling)
 * and PRIO-015 (customer read-only Priority badge & non-monotonic aheadCount helper note).
 * Canonical STS: docs/sprints/sprint-2/tests.md §9.1; UI spec: docs/sprints/sprint-2/ui-spec.md §14–§17.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CUSTOMER,
  ENTRY_ID,
  OPEN_QUEUE,
  OPERATOR,
  callsTo,
  entriesResponse,
  entryResponse,
  errorResponse,
  jsonResponse,
  makeEntry,
  mockApi,
  queuesResponse,
  renderApp,
  type RouteHandler,
} from './testUtils';

const WAITING_NORMAL_ID = '88888888-8888-4888-8888-888888888881';
const WAITING_PRIO_ID = '88888888-8888-4888-8888-888888888882';
const CALLED_PRIO_ID = ENTRY_ID;
const SERVING_ID = '77777777-7777-4777-8777-777777777777';
const NO_SHOW_ID = '99999999-9999-4999-8999-999999999999';
const COMPLETED_ID = '66666666-6666-4666-8666-666666666666';

const ENTRIES_PATH = `/api/operator/queues/${OPEN_QUEUE.id}/entries`;
const priorityPath = (id: string) => `/api/operator/queue-entries/${id}/priority`;

const TEXT = {
  helperNote: 'Queue position may adjust when priority customers are accommodated.',
  notWaitingError: 'This entry is no longer waiting, so its priority cannot be changed.',
  notFoundError: "We couldn't find that queue entry.",
  invalidArgError: 'Invalid priority request. Please refresh and try again.',
  csrfError: "We couldn't verify this request. Please refresh the page or sign in again.",
  forbiddenError: 'You do not have permission to perform this action.',
  genericError: 'Something went wrong. Please try again.',
};

const baseFields = {
  cancelledAt: null,
  noShowAt: null,
  recoveredAt: null,
  noShowCount: 0,
  counterId: null,
  counterName: null,
  priority: 'NORMAL',
};

const waitingNormal = (n = 3) =>
  makeEntry({ ...baseFields, id: WAITING_NORMAL_ID, queueNumber: n, status: 'WAITING', priority: 'NORMAL' });

const waitingPriority = (n = 4) =>
  makeEntry({ ...baseFields, id: WAITING_PRIO_ID, queueNumber: n, status: 'WAITING', priority: 'PRIORITY' });

const calledPriority = (n = 1) =>
  makeEntry({
    ...baseFields,
    id: CALLED_PRIO_ID,
    queueNumber: n,
    status: 'CALLED',
    calledAt: '2026-11-28T09:10:00.000Z',
    priority: 'PRIORITY',
  });

const servingNormal = (n = 2) =>
  makeEntry({
    ...baseFields,
    id: SERVING_ID,
    queueNumber: n,
    status: 'SERVING',
    calledAt: '2026-11-28T09:05:00.000Z',
    serviceStartedAt: '2026-11-28T09:06:00.000Z',
    priority: 'NORMAL',
  });

const noShowPriority = (n = 5) =>
  makeEntry({
    ...baseFields,
    id: NO_SHOW_ID,
    queueNumber: n,
    status: 'NO_SHOW',
    calledAt: '2026-11-28T09:01:00.000Z',
    noShowAt: '2026-11-28T09:03:00.000Z',
    noShowCount: 1,
    priority: 'PRIORITY',
  });

const completedPriority = (n = 6) =>
  makeEntry({
    ...baseFields,
    id: COMPLETED_ID,
    queueNumber: n,
    status: 'COMPLETED',
    calledAt: '2026-11-28T09:01:00.000Z',
    serviceStartedAt: '2026-11-28T09:02:00.000Z',
    completedAt: '2026-11-28T09:04:00.000Z',
    priority: 'PRIORITY',
  });

function mockOperator(state: { entries: unknown[] }, extra: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
    'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
    [`GET ${ENTRIES_PATH}`]: () => entriesResponse(state.entries),
    ...extra,
  });
}

beforeEach(() => {
  document.cookie = 'qms_csrf=operator-csrf-token; path=/';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('F-10 PRIO-014: operator Priority badge, WAITING-only toggle, busy/live/error handling', () => {
  it('renders Priority badge on PRIORITY entries and renders priority toggle ONLY on WAITING entries', async () => {
    mockOperator({
      entries: [
        waitingPriority(4),
        waitingNormal(3),
        calledPriority(1),
        servingNormal(2),
        noShowPriority(5),
        completedPriority(6),
      ],
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const waitPrioCard = await screen.findByTestId('waiting-entry-4');
    const waitNormCard = screen.getByTestId('waiting-entry-3');
    const calledCard = screen.getByTestId('active-entry-1');
    const servingCard = screen.getByTestId('active-entry-2');
    const noShowCard = screen.getByTestId('no-show-entry-5');
    const completedCard = screen.getByTestId('completed-entry-6');

    // Priority badge shown on PRIORITY entries, omitted on NORMAL entries.
    expect(within(waitPrioCard).getByTestId('priority-badge')).toHaveTextContent('Priority');
    expect(within(waitNormCard).queryByTestId('priority-badge')).not.toBeInTheDocument();
    expect(within(calledCard).getByTestId('priority-badge')).toHaveTextContent('Priority');
    expect(within(servingCard).queryByTestId('priority-badge')).not.toBeInTheDocument();
    expect(within(noShowCard).getByTestId('priority-badge')).toHaveTextContent('Priority');
    expect(within(completedCard).getByTestId('priority-badge')).toHaveTextContent('Priority');

    // Priority toggle rendered ONLY on WAITING entries.
    expect(within(waitPrioCard).getByRole('button', { name: 'Set queue number 4 to normal priority' })).toHaveTextContent(
      'Set Normal'
    );
    expect(within(waitNormCard).getByRole('button', { name: 'Set queue number 3 as priority' })).toHaveTextContent(
      'Set Priority'
    );
    for (const nonWaiting of [calledCard, servingCard, noShowCard, completedCard]) {
      expect(within(nonWaiting).queryByRole('button', { name: /priority/i })).not.toBeInTheDocument();
    }
  });

  it('toggles NORMAL -> PRIORITY with CSRF, busy text, double-click guard, live announcement, and list refresh', async () => {
    const state = { entries: [waitingNormal(3)] };
    let resolvePatch!: (res: Response) => void;
    const fetchMock = mockOperator(state, {
      [`PATCH ${priorityPath(WAITING_NORMAL_ID)}`]: () =>
        new Promise<Response>((resolve) => {
          resolvePatch = resolve;
        }),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const btn = await screen.findByRole('button', { name: 'Set queue number 3 as priority' });
    const user = userEvent.setup();

    await user.click(btn);
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Updating priority...');

    // Double-click while in flight must not send a second request.
    await user.click(btn);
    const patchCalls = callsTo(fetchMock, 'PATCH', priorityPath(WAITING_NORMAL_ID));
    expect(patchCalls).toHaveLength(1);
    expect((patchCalls[0].headers as Record<string, string>)['X-CSRF-Token']).toBe('operator-csrf-token');
    expect(JSON.parse(String(patchCalls[0].body))).toEqual({ priority: 'PRIORITY' });

    const promoted = { ...waitingNormal(3), priority: 'PRIORITY' };
    state.entries = [promoted];
    await act(async () => resolvePatch(entryResponse(promoted)));

    expect(await screen.findByRole('status')).toHaveTextContent('Queue number 3 priority set to Priority.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Set queue number 3 to normal priority' })).toBeEnabled()
    );
    expect(within(screen.getByTestId('waiting-entry-3')).getByTestId('priority-badge')).toHaveTextContent('Priority');
  });

  it('toggles PRIORITY -> NORMAL and announces the demotion', async () => {
    const state = { entries: [waitingPriority(4)] };
    const fetchMock = mockOperator(state, {
      [`PATCH ${priorityPath(WAITING_PRIO_ID)}`]: () => {
        const demoted = { ...waitingPriority(4), priority: 'NORMAL' };
        state.entries = [demoted];
        return entryResponse(demoted);
      },
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const btn = await screen.findByRole('button', { name: 'Set queue number 4 to normal priority' });
    await userEvent.setup().click(btn);

    const patchCalls = callsTo(fetchMock, 'PATCH', priorityPath(WAITING_PRIO_ID));
    expect(patchCalls).toHaveLength(1);
    expect(JSON.parse(String(patchCalls[0].body))).toEqual({ priority: 'NORMAL' });
    expect(await screen.findByRole('status')).toHaveTextContent('Queue number 4 priority set to Normal.');
  });

  it.each([
    ['409 INVALID_STATE_TRANSITION', 409, 'INVALID_STATE_TRANSITION', 'Only WAITING allowed', TEXT.notWaitingError, true],
    ['404 RESOURCE_NOT_FOUND', 404, 'RESOURCE_NOT_FOUND', 'Not found', TEXT.notFoundError, true],
    ['400 INVALID_ARGUMENT', 400, 'INVALID_ARGUMENT', 'Bad body', TEXT.invalidArgError, false],
    ['403 CSRF', 403, 'FORBIDDEN', 'Invalid CSRF token.', TEXT.csrfError, false],
    ['403 RBAC', 403, 'FORBIDDEN', 'You are not assigned to this queue.', TEXT.forbiddenError, false],
    ['500 INTERNAL_ERROR', 500, 'INTERNAL_ERROR', 'db crash detail', TEXT.genericError, false],
  ])('maps %s to safe UI message and refreshes on 409/404', async (_label, status, code, serverMsg, expected, shouldRefresh) => {
    const state = { entries: [waitingNormal(3)] };
    const fetchMock = mockOperator(state, {
      [`PATCH ${priorityPath(WAITING_NORMAL_ID)}`]: () => errorResponse(status, code, serverMsg),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const btn = await screen.findByRole('button', { name: 'Set queue number 3 as priority' });
    const readsBefore = callsTo(fetchMock, 'GET', ENTRIES_PATH).length;

    await userEvent.setup().click(btn);
    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    expect(screen.queryByText(serverMsg)).not.toBeInTheDocument();

    if (shouldRefresh) {
      await waitFor(() => expect(callsTo(fetchMock, 'GET', ENTRIES_PATH).length).toBeGreaterThan(readsBefore));
    } else {
      expect(callsTo(fetchMock, 'GET', ENTRIES_PATH).length).toBe(readsBefore);
    }
  });
});

describe('F-10 PRIO-015: customer read-only Priority badge and non-monotonic aheadCount helper note', () => {
  it('renders read-only Priority badge on EntryDetailPage and MyTicketsList with zero priority edit controls', async () => {
    const prioWaiting = makeEntry({
      ...baseFields,
      id: ENTRY_ID,
      queueNumber: 7,
      status: 'WAITING',
      priority: 'PRIORITY',
      aheadCount: 0,
    });
    const normWaiting = makeEntry({
      ...baseFields,
      id: WAITING_NORMAL_ID,
      queueNumber: 8,
      status: 'WAITING',
      priority: 'NORMAL',
      aheadCount: 1,
    });

    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
      'GET /api/queues': () => queuesResponse([OPEN_QUEUE]),
      'GET /api/me/queue-entries': () => entriesResponse([prioWaiting, normWaiting]),
      [`GET /api/me/queue-entries/${ENTRY_ID}`]: () => entryResponse(prioWaiting),
    });

    // Entry detail page
    const detailView = renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByTestId('priority-badge')).toHaveTextContent('Priority');
    expect(screen.getByText(TEXT.helperNote)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /priority/i })).not.toBeInTheDocument();
    detailView.unmount();

    // My Active Tickets tab
    renderApp('/customer');
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'My Active Tickets' }));
    const tickets = await screen.findAllByTestId('ticket');
    expect(within(tickets[0]).getByTestId('priority-badge')).toHaveTextContent('Priority');
    expect(within(tickets[1]).queryByTestId('priority-badge')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /priority/i })).not.toBeInTheDocument();
  });

  it('displays non-monotonic aheadCount helper note for WAITING NORMAL customer and updates when aheadCount increases', async () => {
    let ahead = 0;
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
      'GET /api/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/me/queue-entries/${ENTRY_ID}`]: () =>
        entryResponse(
          makeEntry({
            ...baseFields,
            id: ENTRY_ID,
            queueNumber: 1,
            status: 'WAITING',
            priority: 'NORMAL',
            aheadCount: ahead,
          })
        ),
    });

    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByTestId('entry-message')).toHaveTextContent('You are next');
    expect(screen.queryByTestId('priority-badge')).not.toBeInTheDocument();
    expect(screen.getByText(TEXT.helperNote)).toBeInTheDocument();

    // Simulate another waiting entry being promoted to PRIORITY -> aheadCount rises from 0 to 1.
    ahead = 1;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByTestId('entry-message')).toHaveTextContent('Currently waiting. 1 person ahead of you.');
    expect(screen.getByText(TEXT.helperNote)).toBeInTheDocument();
  });
});
