/**
 * F-09 COUNTER-014 (operator Counters panel, ownership states, fallback, strict entry badges)
 * and COUNTER-015 (customer assigned-counter prompt, null fallback, strict badge rule).
 * Contract: docs/sprints/sprint-2/ui-spec.md §10–§13, docs/sprints/sprint-2/tests.md §8.1.
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

const OTHER_OPERATOR_ID = '44444444-4444-4444-8444-444444444444';
const C1_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const C2_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const C3_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

const CALLED_ID = ENTRY_ID;
const SERVING_ID = '77777777-7777-4777-8777-777777777777';
const WAITING_ID = '88888888-8888-4888-8888-888888888888';
const COMPLETED_ID = '66666666-6666-4666-8666-666666666666';
const NO_SHOW_ID = '99999999-9999-4999-8999-999999999999';
const CANCELLED_ID = '55555555-5555-4555-8555-555555555555';

const ENTRIES_PATH = `/api/operator/queues/${OPEN_QUEUE.id}/entries`;
const COUNTERS_PATH = `/api/operator/queues/${OPEN_QUEUE.id}/counters`;
const counterStatusPath = (id: string) => `/api/operator/counters/${id}/status`;
const counterCallNextPath = (id: string) => `/api/operator/counters/${id}/call-next`;

const TEXT = {
  otherOperator: 'Assigned to another operator',
  noCounters: 'No counters configured for this queue.',
  counterClosed: 'This counter is closed. Open the counter before calling the next customer.',
  noWaiting: 'There are no waiting customers in this queue right now.',
  invalidArg: 'Invalid counter request. Please refresh and try again.',
  counterNotFound: "We couldn't find that counter.",
  csrf: "We couldn't verify this request. Please refresh the page or sign in again.",
  generic: 'Something went wrong. Please try again.',
};

interface MockCounter {
  id: string;
  serviceQueueId: string;
  name: string;
  status: 'OPEN' | 'CLOSED';
  assignedOperatorId: string | null;
  createdAt: string;
  updatedAt: string;
}

function makeCounter(overrides: Partial<MockCounter> = {}): MockCounter {
  return {
    id: C1_ID,
    serviceQueueId: OPEN_QUEUE.id,
    name: 'Counter 1',
    status: 'OPEN',
    assignedOperatorId: null,
    createdAt: '2026-11-27T09:00:00.000Z',
    updatedAt: '2026-11-27T09:00:00.000Z',
    ...overrides,
  };
}

const countersResponse = (counters: MockCounter[]) => jsonResponse(200, { data: { counters } });
const counterResponse = (counter: MockCounter) => jsonResponse(200, { data: { counter } });

const baseFields = {
  cancelledAt: null,
  noShowAt: null,
  recoveredAt: null,
  noShowCount: 0,
  counterId: null,
  counterName: null,
};

const calledEntry = (counterId: string | null = C1_ID, counterName: string | null = 'Counter 1', n = 1) =>
  makeEntry({
    ...baseFields,
    id: CALLED_ID,
    queueNumber: n,
    status: 'CALLED',
    calledAt: '2026-11-27T09:10:00.000Z',
    counterId,
    counterName,
  });

const servingEntry = (counterId: string | null = C2_ID, counterName: string | null = 'Counter 2', n = 5) =>
  makeEntry({
    ...baseFields,
    id: SERVING_ID,
    queueNumber: n,
    status: 'SERVING',
    calledAt: '2026-11-27T09:05:00.000Z',
    serviceStartedAt: '2026-11-27T09:06:00.000Z',
    counterId,
    counterName,
  });

const waitingEntry = (n = 3) =>
  makeEntry({ ...baseFields, id: WAITING_ID, queueNumber: n, status: 'WAITING' });

const completedEntry = (n = 2) =>
  makeEntry({
    ...baseFields,
    id: COMPLETED_ID,
    queueNumber: n,
    status: 'COMPLETED',
    calledAt: '2026-11-27T09:01:00.000Z',
    serviceStartedAt: '2026-11-27T09:02:00.000Z',
    completedAt: '2026-11-27T09:04:00.000Z',
    counterId: C1_ID,
    counterName: 'Counter 1',
  });

const noShowEntry = (n = 4) =>
  makeEntry({
    ...baseFields,
    id: NO_SHOW_ID,
    queueNumber: n,
    status: 'NO_SHOW',
    calledAt: '2026-11-27T09:01:00.000Z',
    noShowAt: '2026-11-27T09:03:00.000Z',
    noShowCount: 1,
    counterId: C1_ID,
    counterName: 'Counter 1',
  });

const cancelledEntry = (n = 6) =>
  makeEntry({
    ...baseFields,
    id: CANCELLED_ID,
    queueNumber: n,
    status: 'CANCELLED',
    cancelledAt: '2026-11-27T09:02:00.000Z',
  });

function mockOperator(
  state: { entries: unknown[]; counters: MockCounter[] },
  extra: Record<string, RouteHandler> = {}
) {
  return mockApi({
    'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
    'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
    [`GET ${ENTRIES_PATH}`]: () => entriesResponse(state.entries),
    [`GET ${COUNTERS_PATH}`]: () => countersResponse(state.counters),
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

describe('F-09 COUNTER-014: operator Counters panel, ownership states, fallback, and strict entry badges', () => {
  it('renders Counters panel with Open/Closed badges, disabled controls for other-operator counters, and strict CALLED/SERVING-only entry badges', async () => {
    const c1 = makeCounter({ id: C1_ID, name: 'Counter 1', status: 'OPEN', assignedOperatorId: null });
    const c2 = makeCounter({ id: C2_ID, name: 'Counter 2', status: 'CLOSED', assignedOperatorId: null });
    const c3 = makeCounter({ id: C3_ID, name: 'Counter 3', status: 'OPEN', assignedOperatorId: OTHER_OPERATOR_ID });

    mockOperator({
      counters: [c1, c2, c3],
      entries: [calledEntry(C1_ID, 'Counter 1', 1), servingEntry(C2_ID, 'Counter 2', 5), waitingEntry(3), noShowEntry(4), completedEntry(2)],
    });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    expect(await screen.findByRole('heading', { name: 'Counters (3)' })).toBeInTheDocument();

    // Legacy queue-level Call Next is hidden when the operator has at least one usable counter.
    expect(screen.queryByRole('button', { name: 'Call Next' })).not.toBeInTheDocument();

    // Counter 1 (OPEN, usable): both Close Counter 1 and Call Next enabled.
    expect(screen.getByRole('button', { name: 'Close Counter 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Call next customer to Counter 1' })).toBeEnabled();

    // Counter 2 (CLOSED, usable): Open Counter 2 enabled, Call Next disabled.
    expect(screen.getByRole('button', { name: 'Open Counter 2' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Call next customer to Counter 2' })).toBeDisabled();

    // Counter 3 (assigned to another operator): both buttons disabled and label visible (Nit #1).
    expect(screen.getByText(TEXT.otherOperator)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Counter 3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Call next customer to Counter 3' })).toBeDisabled();

    // Strict counter badge rule (Nit #5): CALLED and SERVING show counter badge; WAITING/NO_SHOW/COMPLETED do NOT.
    expect(within(screen.getByTestId('active-entry-1')).getByText('Counter 1')).toBeInTheDocument();
    expect(within(screen.getByTestId('active-entry-5')).getByText('Counter 2')).toBeInTheDocument();
    expect(within(screen.getByTestId('waiting-entry-3')).queryByText(/Counter \d/)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('no-show-entry-4')).queryByText(/Counter \d/)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('completed-entry-2')).queryByText(/Counter \d/)).not.toBeInTheDocument();
  });

  it('shows legacy queue-level Call Next fallback when queue has zero counters or when every counter is assigned to another operator', async () => {
    // Case A: zero counters.
    mockOperator({ counters: [], entries: [waitingEntry(3)] });
    const first = renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    expect(await screen.findByText(TEXT.noCounters)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call Next' })).toBeEnabled();
    first.unmount();

    // Case B: all counters assigned to another operator (zero usable counters -> Nit #1).
    mockOperator({
      counters: [makeCounter({ id: C3_ID, name: 'Counter 3', status: 'OPEN', assignedOperatorId: OTHER_OPERATOR_ID })],
      entries: [waitingEntry(3)],
    });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    expect(await screen.findByText(TEXT.otherOperator)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Call Next' })).toBeEnabled();
  });

  it('toggles counter status with CSRF, busy state, double-click guard, and live announcement', async () => {
    const user = userEvent.setup();
    const c1 = makeCounter({ id: C1_ID, name: 'Counter 1', status: 'OPEN' });
    const state = { counters: [c1], entries: [] as unknown[] };
    let release!: () => void;

    const fetchMock = mockOperator(state, {
      [`PATCH ${counterStatusPath(C1_ID)}`]: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            const updated: MockCounter = { ...c1, status: 'CLOSED' };
            state.counters = [updated];
            resolve(counterResponse(updated));
          };
        }),
    });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    const toggleBtn = await screen.findByRole('button', { name: 'Close Counter 1' });
    await user.click(toggleBtn);
    await user.click(toggleBtn);

    expect(toggleBtn).toBeDisabled();
    expect(toggleBtn).toHaveTextContent('Updating counter...');
    expect(screen.getByRole('button', { name: 'Call next customer to Counter 1' })).toBeDisabled();
    expect(callsTo(fetchMock, 'PATCH', counterStatusPath(C1_ID))).toHaveLength(1);
    const [req] = callsTo(fetchMock, 'PATCH', counterStatusPath(C1_ID));
    expect((req.headers as Record<string, string>)['X-CSRF-Token']).toBe('operator-csrf-token');
    expect(JSON.parse(String(req.body))).toEqual({ status: 'CLOSED' });

    await act(async () => release());
    expect(await screen.findByText('Counter 1 is now Closed.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Open Counter 1' })).toBeEnabled();
  });

  it('calls next for an OPEN counter with busy state, double-click guard, and refreshed active entry badge', async () => {
    const user = userEvent.setup();
    const c1 = makeCounter({ id: C1_ID, name: 'Counter 1', status: 'OPEN' });
    const state = { counters: [c1], entries: [waitingEntry(7)] as unknown[] };
    let release!: () => void;

    const fetchMock = mockOperator(state, {
      [`POST ${counterCallNextPath(C1_ID)}`]: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            const called = calledEntry(C1_ID, 'Counter 1', 7);
            state.entries = [called];
            resolve(entryResponse(called));
          };
        }),
    });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    const callBtn = await screen.findByRole('button', { name: 'Call next customer to Counter 1' });
    await user.click(callBtn);
    await user.click(callBtn);

    expect(callBtn).toBeDisabled();
    expect(callBtn).toHaveTextContent('Calling next...');
    expect(callsTo(fetchMock, 'POST', counterCallNextPath(C1_ID))).toHaveLength(1);

    await act(async () => release());
    expect(await screen.findByText('Called queue number 7 to Counter 1.')).toBeInTheDocument();
    expect(within(await screen.findByTestId('active-entry-7')).getByText('Counter 1')).toBeInTheDocument();
  });

  it.each([
    ['409 COUNTER_CLOSED', () => errorResponse(409, 'COUNTER_CLOSED'), TEXT.counterClosed, true],
    ['409 NO_WAITING_ENTRIES', () => errorResponse(409, 'NO_WAITING_ENTRIES'), TEXT.noWaiting, true],
    ['400 INVALID_ARGUMENT', () => errorResponse(400, 'INVALID_ARGUMENT'), TEXT.invalidArg, false],
    ['404 RESOURCE_NOT_FOUND', () => errorResponse(404, 'RESOURCE_NOT_FOUND'), TEXT.counterNotFound, true],
    ['403 CSRF', () => errorResponse(403, 'FORBIDDEN', 'CSRF token could not be verified.'), TEXT.csrf, false],
    ['500 INTERNAL_ERROR', () => errorResponse(500, 'INTERNAL_ERROR'), TEXT.generic, false],
  ])('maps %s on counter Call Next to the ui-spec §12.3 alert and reloads when specified', async (_name, handler, msg, reloads) => {
    const user = userEvent.setup();
    const fetchMock = mockOperator(
      { counters: [makeCounter()], entries: [waitingEntry(1)] },
      { [`POST ${counterCallNextPath(C1_ID)}`]: handler }
    );
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    await user.click(await screen.findByRole('button', { name: 'Call next customer to Counter 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(msg);
    if (reloads) {
      await waitFor(() => expect(callsTo(fetchMock, 'GET', COUNTERS_PATH).length + callsTo(fetchMock, 'GET', ENTRIES_PATH).length).toBeGreaterThanOrEqual(3));
    }
  });
});

describe('F-09 COUNTER-015: customer assigned counter prompt, null fallback, and strict badge rule', () => {
  const DETAIL_PATH = `/api/me/queue-entries/${ENTRY_ID}`;

  function mockCustomerDetail(entry: Record<string, unknown>) {
    return mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
      'GET /api/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET ${DETAIL_PATH}`]: () => entryResponse({ ...entry, aheadCount: 0 }),
    });
  }

  it('CALLED with counterName shows "Please proceed to Counter 1." and counter badge', async () => {
    mockCustomerDetail(calledEntry(C1_ID, 'Counter 1', 12));
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByTestId('entry-message')).toHaveTextContent('Please proceed to Counter 1.');
    expect(screen.getByText('Counter 1')).toBeInTheDocument();
  });

  it('SERVING with counterName shows "Your service is in progress at Counter 2." and counter badge', async () => {
    mockCustomerDetail({ ...servingEntry(C2_ID, 'Counter 2', 12), id: ENTRY_ID });
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByTestId('entry-message')).toHaveTextContent('Your service is in progress at Counter 2.');
    expect(screen.getByText('Counter 2')).toBeInTheDocument();
  });

  it('CALLED and SERVING with null counterName fall back to Sprint 1 messages with no counter badge', async () => {
    mockCustomerDetail(calledEntry(null, null, 12));
    const first = renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByTestId('entry-message')).toHaveTextContent('Please go to the service desk.');
    expect(screen.queryByText(/Counter \d/)).not.toBeInTheDocument();
    first.unmount();

    mockCustomerDetail({ ...servingEntry(null, null, 12), id: ENTRY_ID });
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByTestId('entry-message')).toHaveTextContent('Your service is in progress.');
    expect(screen.queryByText(/Counter \d/)).not.toBeInTheDocument();
  });

  it('renders no counter badge on WAITING, COMPLETED, NO_SHOW, or CANCELLED entries on EntryDetailPage', async () => {
    for (const entry of [
      { ...waitingEntry(1), id: ENTRY_ID },
      { ...completedEntry(2), id: ENTRY_ID },
      { ...noShowEntry(3), id: ENTRY_ID },
      { ...cancelledEntry(4), id: ENTRY_ID },
    ]) {
      mockCustomerDetail(entry);
      const rendered = renderApp(`/customer/entries/${ENTRY_ID}`);
      expect(await screen.findByTestId('entry-message')).toBeInTheDocument();
      expect(screen.queryByText(/Counter \d/)).not.toBeInTheDocument();
      rendered.unmount();
    }
  });

  it('My Active Tickets renders counter badge on CALLED and SERVING entries only', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
      'GET /api/queues': () => queuesResponse([OPEN_QUEUE]),
      'GET /api/me/queue-entries': () =>
        entriesResponse([
          calledEntry(C1_ID, 'Counter 1', 1),
          servingEntry(C2_ID, 'Counter 2', 2),
          waitingEntry(3),
          completedEntry(4),
          noShowEntry(5),
          cancelledEntry(6),
        ]),
    });
    renderApp('/customer');

    await user.click(await screen.findByRole('tab', { name: 'My Active Tickets' }));
    const tickets = await screen.findAllByTestId('ticket');
    expect(tickets).toHaveLength(6);

    expect(within(tickets[0]).getByText('Counter 1')).toBeInTheDocument();
    expect(within(tickets[1]).getByText('Counter 2')).toBeInTheDocument();
    expect(within(tickets[2]).queryByText(/Counter \d/)).not.toBeInTheDocument();
    expect(within(tickets[3]).queryByText(/Counter \d/)).not.toBeInTheDocument();
    expect(within(tickets[4]).queryByText(/Counter \d/)).not.toBeInTheDocument();
    expect(within(tickets[5]).queryByText(/Counter \d/)).not.toBeInTheDocument();
  });
});
