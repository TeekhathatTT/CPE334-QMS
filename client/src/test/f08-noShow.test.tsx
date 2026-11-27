/**
 * F-08 NOSHOW-015 (operator queue page) and NOSHOW-016 (customer entry page).
 * Contract: docs/sprints/sprint-2/ui-spec.md §6–§9, docs/sprints/sprint-2/tests.md §7.1.
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

const CALLED_ID = ENTRY_ID;
const NO_SHOW_1_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const NO_SHOW_2_ID = '99999999-9999-4999-8999-999999999999';
const WAITING_ID = '88888888-8888-4888-8888-888888888888';
const SERVING_ID = '77777777-7777-4777-8777-777777777777';

const ENTRIES_PATH = `/api/operator/queues/${OPEN_QUEUE.id}/entries`;
const noShowPath = (id: string) => `/api/operator/queue-entries/${id}/no-show`;
const recoverPath = (id: string) => `/api/operator/queue-entries/${id}/recover`;

const NO_SHOW_AT = '2026-11-27T09:13:30.120Z';
const RECOVERED_AT = '2026-11-27T09:20:02.004Z';

const TEXT = {
  limitNote: 'Already returned once. This entry cannot be returned again.',
  limitError: 'This entry was already returned to the queue once and cannot be returned again.',
  rejoinedError: 'This customer has already joined the queue again, so this entry cannot be returned.',
  conflict: "This queue entry's status has changed. The queue has been refreshed.",
  notFound: "We couldn't find that queue entry.",
  csrf: "We couldn't verify this request. Please refresh the page or sign in again.",
  generic: 'Something went wrong. Please try again.',
  customerCanReturn: 'You missed your turn. If you are still here, please go to the counter. Staff can return you to the queue once.',
  customerFinal: 'You missed your turn again, so this entry is closed. You can join the queue again.',
};

const f08 = { noShowAt: null, recoveredAt: null, noShowCount: 0, cancelledAt: null };

const called = (n = 1) =>
  makeEntry({ ...f08, id: CALLED_ID, queueNumber: n, status: 'CALLED', joinedAt: '2026-11-27T09:00:00.000Z', calledAt: '2026-11-27T09:10:00.000Z' });
const serving = () =>
  makeEntry({
    ...f08,
    id: SERVING_ID,
    queueNumber: 5,
    status: 'SERVING',
    joinedAt: '2026-11-27T08:59:00.000Z',
    calledAt: '2026-11-27T09:05:00.000Z',
    serviceStartedAt: '2026-11-27T09:06:00.000Z',
  });
const waiting = (id = WAITING_ID, n = 3) => makeEntry({ ...f08, id, queueNumber: n, status: 'WAITING', joinedAt: '2026-11-27T09:02:00.000Z' });
const missed = (id: string, n: number, count: 1 | 2) =>
  makeEntry({
    ...f08,
    id,
    queueNumber: n,
    status: 'NO_SHOW',
    joinedAt: '2026-11-27T08:50:00.000Z',
    calledAt: '2026-11-27T09:12:00.000Z',
    noShowAt: NO_SHOW_AT,
    noShowCount: count,
    recoveredAt: count === 2 ? RECOVERED_AT : null,
  });
const returned = (id: string, n: number) =>
  makeEntry({ ...f08, id, queueNumber: n, status: 'WAITING', joinedAt: '2026-11-27T08:50:00.000Z', noShowAt: NO_SHOW_AT, noShowCount: 1, recoveredAt: RECOVERED_AT });

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

describe('F-08 NOSHOW-015: operator no-show controls', () => {
  it('shows Mark no-show only for CALLED entries, and a No-show section with Return only while noShowCount is 1', async () => {
    mockOperator({ entries: [missed(NO_SHOW_2_ID, 2, 2), missed(NO_SHOW_1_ID, 4, 1), serving(), called(1), waiting()] });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    expect(await screen.findByRole('heading', { name: 'General Inquiry Desk' })).toBeInTheDocument();
    expect(within(screen.getByTestId('active-entry-1')).getByRole('button', { name: 'Mark queue number 1 as no-show' })).toBeEnabled();
    expect(within(screen.getByTestId('active-entry-5')).queryByRole('button', { name: /no-show/i })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('waiting-entry-3')).queryByRole('button')).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'No-show (2)' })).toBeInTheDocument();
    expect(screen.getByTestId('no-show-count')).toHaveTextContent('2');
    expect(screen.getByTestId('waiting-count')).toHaveTextContent('1');
    expect(screen.getByTestId('active-count')).toHaveTextContent('2');

    const once = screen.getByTestId('no-show-entry-4');
    expect(within(once).getByText('No-show', { selector: '[data-status]' })).toBeInTheDocument();
    expect(within(once).getByText('Missed:').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', NO_SHOW_AT);
    expect(within(once).getByRole('button', { name: 'Return queue number 4 to the queue' })).toBeEnabled();

    const twice = screen.getByTestId('no-show-entry-2');
    expect(within(twice).queryByRole('button')).not.toBeInTheDocument();
    expect(within(twice).getByText(TEXT.limitNote)).toBeInTheDocument();
    expect(within(twice).getByText('Returned to queue:').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', RECOVERED_AT);
  });

  it('shows an empty No-show section when there are no missed entries', async () => {
    mockOperator({ entries: [waiting()] });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    expect(await screen.findByRole('heading', { name: 'No-show (0)' })).toBeInTheDocument();
    expect(screen.getByText('No missed entries.')).toBeInTheDocument();
  });

  it('Mark no-show sends one POST with CSRF, shows the busy text, then moves the entry to the No-show section', async () => {
    const user = userEvent.setup();
    const state = { entries: [called(1)] as unknown[] };
    let release!: () => void;
    const fetchMock = mockOperator(state, {
      [`POST ${noShowPath(CALLED_ID)}`]: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            state.entries = [missed(CALLED_ID, 1, 1)];
            resolve(entryResponse(missed(CALLED_ID, 1, 1)));
          };
        }),
    });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    const button = await screen.findByRole('button', { name: 'Mark queue number 1 as no-show' });
    await user.click(button);
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Marking no-show...');
    expect(within(screen.getByTestId('active-entry-1')).getByRole('button', { name: 'Start Service for queue number 1' })).toBeDisabled();
    expect(callsTo(fetchMock, 'POST', noShowPath(CALLED_ID))).toHaveLength(1);
    const [req] = callsTo(fetchMock, 'POST', noShowPath(CALLED_ID));
    expect((req.headers as Record<string, string>)['X-CSRF-Token']).toBe('operator-csrf-token');

    await act(async () => release());
    expect(await screen.findByText('Marked queue number 1 as no-show.')).toBeInTheDocument();
    expect(await screen.findByTestId('no-show-entry-1')).toBeInTheDocument();
    expect(screen.queryByTestId('active-entry-1')).not.toBeInTheDocument();
  });

  it('Return to queue shows the busy text, then the entry is back in the Waiting Queue at its FIFO position', async () => {
    const user = userEvent.setup();
    const state = { entries: [missed(NO_SHOW_1_ID, 4, 1), waiting()] as unknown[] };
    let release!: () => void;
    const fetchMock = mockOperator(state, {
      [`POST ${recoverPath(NO_SHOW_1_ID)}`]: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            state.entries = [returned(NO_SHOW_1_ID, 4), waiting()];
            resolve(entryResponse(returned(NO_SHOW_1_ID, 4)));
          };
        }),
    });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    const button = await screen.findByRole('button', { name: 'Return queue number 4 to the queue' });
    await user.click(button);
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Returning to queue...');
    expect(callsTo(fetchMock, 'POST', recoverPath(NO_SHOW_1_ID))).toHaveLength(1);

    await act(async () => release());
    expect(await screen.findByText('Returned queue number 4 to the queue.')).toBeInTheDocument();
    const back = await screen.findByTestId('waiting-entry-4');
    expect(within(back).getByText('#1')).toBeInTheDocument();
    expect(within(screen.getByTestId('waiting-entry-3')).getByText('#2')).toBeInTheDocument();
    expect(screen.queryByTestId('no-show-entry-4')).not.toBeInTheDocument();
  });

  it.each([
    ['409 RECOVERY_LIMIT_REACHED', () => errorResponse(409, 'RECOVERY_LIMIT_REACHED'), TEXT.limitError, true],
    ['409 DUPLICATE_ACTIVE_ENTRY', () => errorResponse(409, 'DUPLICATE_ACTIVE_ENTRY'), TEXT.rejoinedError, true],
    ['409 INVALID_STATE_TRANSITION', () => errorResponse(409, 'INVALID_STATE_TRANSITION'), TEXT.conflict, true],
    ['404', () => errorResponse(404, 'RESOURCE_NOT_FOUND'), TEXT.notFound, true],
    ['403 CSRF', () => errorResponse(403, 'FORBIDDEN', 'CSRF token could not be verified.'), TEXT.csrf, false],
    ['500', () => errorResponse(500, 'INTERNAL_ERROR'), TEXT.generic, false],
  ])('Return to queue on %s shows the right alert and reloads the list when it should', async (_name, handler, message, reloads) => {
    const user = userEvent.setup();
    const fetchMock = mockOperator({ entries: [missed(NO_SHOW_1_ID, 4, 1)] }, { [`POST ${recoverPath(NO_SHOW_1_ID)}`]: handler });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    await user.click(await screen.findByRole('button', { name: 'Return queue number 4 to the queue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    const reads = callsTo(fetchMock, 'GET', ENTRIES_PATH).length;
    if (reloads) {
      expect(reads).toBeGreaterThanOrEqual(2);
    } else {
      expect(reads).toBe(1);
    }
  });

  it('Mark no-show on 409 shows the conflict alert and reloads the list', async () => {
    const user = userEvent.setup();
    const fetchMock = mockOperator({ entries: [called(1)] }, { [`POST ${noShowPath(CALLED_ID)}`]: () => errorResponse(409, 'INVALID_STATE_TRANSITION') });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    await user.click(await screen.findByRole('button', { name: 'Mark queue number 1 as no-show' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.conflict);
    await waitFor(() => expect(callsTo(fetchMock, 'GET', ENTRIES_PATH).length).toBeGreaterThanOrEqual(2));
  });
});

describe('F-08 NOSHOW-016: customer view of a NO_SHOW entry', () => {
  const DETAIL_PATH = `/api/me/queue-entries/${ENTRY_ID}`;

  function mockCustomer(state: { entry: () => Response }) {
    return mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
      'GET /api/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET ${DETAIL_PATH}`]: () => state.entry(),
    });
  }

  it('a NO_SHOW entry that can still be returned: badge, Missed time, message, no Leave queue, polling continues', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fetchMock = mockCustomer({ entry: () => entryResponse({ ...missed(ENTRY_ID, 12, 1), aheadCount: 0 }) });
    renderApp(`/customer/entries/${ENTRY_ID}`);

    expect(await screen.findByText('No-show', { selector: '[data-status]' })).toBeInTheDocument();
    expect(screen.getByTestId('entry-message')).toHaveTextContent(TEXT.customerCanReturn);
    expect(screen.getByText('Missed:').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', NO_SHOW_AT);
    expect(screen.queryByRole('button', { name: 'Leave queue' })).not.toBeInTheDocument();

    const before = callsTo(fetchMock, 'GET', DETAIL_PATH).length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(callsTo(fetchMock, 'GET', DETAIL_PATH).length).toBeGreaterThan(before);
  });

  it('a final NO_SHOW entry: closed message, terminal footer, polling stops', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fetchMock = mockCustomer({ entry: () => entryResponse({ ...missed(ENTRY_ID, 12, 2), aheadCount: 0 }) });
    renderApp(`/customer/entries/${ENTRY_ID}`);

    expect(await screen.findByText('No-show', { selector: '[data-status]' })).toBeInTheDocument();
    expect(screen.getByTestId('entry-message')).toHaveTextContent(TEXT.customerFinal);
    expect(screen.getByText('This entry no longer updates.')).toBeInTheDocument();

    const before = callsTo(fetchMock, 'GET', DETAIL_PATH).length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });
    expect(callsTo(fetchMock, 'GET', DETAIL_PATH).length).toBe(before);
  });

  it('a returned entry shows Waiting, the Returned to queue time and the Leave queue button', async () => {
    mockCustomer({ entry: () => entryResponse({ ...returned(ENTRY_ID, 12), aheadCount: 0 }) });
    renderApp(`/customer/entries/${ENTRY_ID}`);

    expect(await screen.findByText('Waiting', { selector: '[data-status]' })).toBeInTheDocument();
    expect(screen.getByText('Returned to queue:').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', RECOVERED_AT);
    expect(screen.getByRole('button', { name: 'Leave queue' })).toBeInTheDocument();
  });
});

describe('F-08 NOSHOW-023: return blocked by the BR-06 cap (AC-45)', () => {
  it('Return to queue on 409 MAX_ACTIVE_ENTRIES_REACHED shows the cap message and reloads the list', async () => {
    const user = userEvent.setup();
    const fetchMock = mockOperator(
      { entries: [missed(NO_SHOW_1_ID, 4, 1)] },
      { [`POST ${recoverPath(NO_SHOW_1_ID)}`]: () => errorResponse(409, 'MAX_ACTIVE_ENTRIES_REACHED') }
    );
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    await user.click(await screen.findByRole('button', { name: 'Return queue number 4 to the queue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This customer already has 2 active queue entries, so this entry cannot be returned right now.'
    );
    await waitFor(() => expect(callsTo(fetchMock, 'GET', ENTRIES_PATH).length).toBeGreaterThanOrEqual(2));
  });
});
