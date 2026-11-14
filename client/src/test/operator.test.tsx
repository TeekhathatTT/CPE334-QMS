import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CUSTOMER,
  ENTRY_ID,
  OPEN_QUEUE,
  OPERATOR,
  SECOND_QUEUE,
  callsTo,
  entriesResponse,
  entryResponse,
  errorResponse,
  jsonResponse,
  makeEntry,
  mockApi,
  queuesResponse,
  renderApp,
} from './testUtils';

const CLOSED_QUEUE = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Specialized Consultation',
  description: 'By appointment only',
  availability: 'CLOSED',
};

const ENTRY_2_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ENTRY_3_ID = '99999999-9999-4999-8999-999999999999';

const location = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  document.cookie = 'qms_csrf=operator-csrf-token; path=/';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Operator Dashboard (/operator)', () => {
  it('displays assigned OPEN and CLOSED queues and navigates to queue management screen', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE, CLOSED_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () => entriesResponse([]),
    });

    renderApp('/operator');

    expect(await screen.findByRole('heading', { name: 'Assigned queues' })).toBeInTheDocument();
    expect(await screen.findByText('General Inquiry Desk')).toBeInTheDocument();
    expect(screen.getByText('Walk-in help for general questions')).toBeInTheDocument();
    expect(screen.getByText('Specialized Consultation')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Manage queue: General Inquiry Desk' }));

    await waitFor(() => expect(location()).toBe(`/operator/queues/${OPEN_QUEUE.id}`));
    expect(await screen.findByRole('heading', { name: 'General Inquiry Desk' })).toBeInTheDocument();
  });

  it('shows neutral empty state when operator has no assigned queues', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([]),
    });

    renderApp('/operator');

    expect(await screen.findByText('You have no assigned service queues.')).toBeInTheDocument();
  });

  it('shows safe error note and retries when loading assigned queues fails', async () => {
    let attempts = 0;
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => {
        attempts += 1;
        if (attempts === 1) return errorResponse(500, 'INTERNAL_ERROR', 'db connection stack trace');
        return queuesResponse([OPEN_QUEUE]);
      },
    });

    renderApp('/operator');

    expect(
      await screen.findByText("We couldn't load your assigned queues. Please try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/stack trace/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('General Inquiry Desk')).toBeInTheDocument();
  });
});

describe('Operator Queue Management (/operator/queues/:id)', () => {
  it('groups entries into Active Service, Waiting Queue (FIFO), and Completed with proper button states', async () => {
    const calledEntry = makeEntry({
      id: ENTRY_ID,
      queueNumber: 1,
      status: 'CALLED',
      joinedAt: '2026-11-13T09:00:00.000Z',
      calledAt: '2026-11-13T09:02:00.000Z',
    });
    const servingEntry = makeEntry({
      id: ENTRY_2_ID,
      queueNumber: 2,
      status: 'SERVING',
      joinedAt: '2026-11-13T09:01:00.000Z',
      calledAt: '2026-11-13T09:03:00.000Z',
      serviceStartedAt: '2026-11-13T09:04:00.000Z',
    });
    const waitingEntry = makeEntry({
      id: ENTRY_3_ID,
      queueNumber: 3,
      status: 'WAITING',
      joinedAt: '2026-11-13T09:05:00.000Z',
    });
    const completedEntry = makeEntry({
      id: '44444444-4444-4444-8444-444444444444',
      queueNumber: 4,
      status: 'COMPLETED',
      joinedAt: '2026-11-13T08:50:00.000Z',
      calledAt: '2026-11-13T08:52:00.000Z',
      serviceStartedAt: '2026-11-13T08:53:00.000Z',
      completedAt: '2026-11-13T08:58:00.000Z',
    });

    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () =>
        entriesResponse([calledEntry, servingEntry, waitingEntry, completedEntry]),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    expect(await screen.findByRole('heading', { name: 'General Inquiry Desk' })).toBeInTheDocument();
    expect(screen.getByTestId('waiting-count')).toHaveTextContent('1');
    expect(screen.getByTestId('active-count')).toHaveTextContent('2');
    expect(screen.getByTestId('completed-count')).toHaveTextContent('1');

    // Verify CALLED entry (#1): Start Service enabled, Complete Service disabled
    const calledCard = screen.getByTestId('active-entry-1');
    const startBtn1 = within(calledCard).getByRole('button', {
      name: 'Start Service for queue number 1',
    });
    const completeBtn1 = within(calledCard).getByRole('button', {
      name: 'Complete Service for queue number 1',
    });
    expect(startBtn1).toBeEnabled();
    expect(completeBtn1).toBeDisabled();

    // Verify SERVING entry (#2): Start Service disabled, Complete Service enabled
    const servingCard = screen.getByTestId('active-entry-2');
    const startBtn2 = within(servingCard).getByRole('button', {
      name: 'Start Service for queue number 2',
    });
    const completeBtn2 = within(servingCard).getByRole('button', {
      name: 'Complete Service for queue number 2',
    });
    expect(startBtn2).toBeDisabled();
    expect(completeBtn2).toBeEnabled();

    // Verify WAITING entry (#3) in FIFO waiting list with #1 position badge
    const waitingCard = screen.getByTestId('waiting-entry-3');
    expect(within(waitingCard).getByText('#1')).toBeInTheDocument();
    expect(within(waitingCard).getByText('Waiting')).toBeInTheDocument();

    // Verify COMPLETED entry (#4)
    const completedCard = screen.getByTestId('completed-entry-4');
    expect(within(completedCard).getByText('Completed')).toBeInTheDocument();
  });

  it('executes Call Next, Start Service, and Complete Service lifecycle end-to-end with CSRF and UI refresh', async () => {
    let currentEntries: Record<string, unknown>[] = [
      makeEntry({
        id: ENTRY_ID,
        queueNumber: 7,
        status: 'WAITING',
        joinedAt: '2026-11-13T09:00:00.000Z',
      }),
    ];

    const fetchMock = mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () => entriesResponse(currentEntries),
      [`POST /api/operator/queues/${OPEN_QUEUE.id}/call-next`]: () => {
        const called = {
          ...currentEntries[0],
          status: 'CALLED',
          calledAt: '2026-11-13T09:05:00.000Z',
        };
        currentEntries = [called];
        return entryResponse(called);
      },
      [`POST /api/operator/queue-entries/${ENTRY_ID}/start`]: () => {
        const serving = {
          ...currentEntries[0],
          status: 'SERVING',
          serviceStartedAt: '2026-11-13T09:06:00.000Z',
        };
        currentEntries = [serving];
        return entryResponse(serving);
      },
      [`POST /api/operator/queue-entries/${ENTRY_ID}/complete`]: () => {
        const completed = {
          ...currentEntries[0],
          status: 'COMPLETED',
          completedAt: '2026-11-13T09:10:00.000Z',
        };
        currentEntries = [completed];
        return entryResponse(completed);
      },
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const user = userEvent.setup();

    // Initially entry #7 is in Waiting Queue
    expect(await screen.findByTestId('waiting-entry-7')).toBeInTheDocument();

    // 1. Click Call Next
    await user.click(screen.getByRole('button', { name: 'Call Next' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Called queue number 7.');
    const activeCardAfterCall = await screen.findByTestId('active-entry-7');
    expect(within(activeCardAfterCall).getByText('Called')).toBeInTheDocument();

    // Verify CSRF header sent on call-next
    const [callNextReq] = callsTo(fetchMock, 'POST', `/api/operator/queues/${OPEN_QUEUE.id}/call-next`);
    expect((callNextReq.headers as Record<string, string>)['X-CSRF-Token']).toBe('operator-csrf-token');

    // 2. Click Start Service
    const startBtn = within(activeCardAfterCall).getByRole('button', {
      name: 'Start Service for queue number 7',
    });
    expect(startBtn).toBeEnabled();
    await user.click(startBtn);

    expect(await screen.findByRole('status')).toHaveTextContent('Started service for queue number 7.');
    const activeCardAfterStart = await screen.findByTestId('active-entry-7');
    expect(within(activeCardAfterStart).getByText('In service')).toBeInTheDocument();
    expect(
      within(activeCardAfterStart).getByRole('button', { name: 'Start Service for queue number 7' })
    ).toBeDisabled();

    // 3. Click Complete Service
    const completeBtn = within(activeCardAfterStart).getByRole('button', {
      name: 'Complete Service for queue number 7',
    });
    expect(completeBtn).toBeEnabled();
    await user.click(completeBtn);

    expect(await screen.findByRole('status')).toHaveTextContent('Completed service for queue number 7.');
    expect(await screen.findByTestId('completed-entry-7')).toBeInTheDocument();
    expect(screen.queryByTestId('active-entry-7')).not.toBeInTheDocument();
  });

  it('shows neutral empty status when Call Next returns 204 No Content', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () => entriesResponse([]),
      [`POST /api/operator/queues/${OPEN_QUEUE.id}/call-next`]: () => new Response(null, { status: 204 }),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'General Inquiry Desk' });
    await user.click(screen.getByRole('button', { name: 'Call Next' }));

    expect(await screen.findByRole('status')).toHaveTextContent('No waiting entries to call right now.');
  });

  it('disables Call Next with "Calling next..." while in flight and prevents duplicate submissions', async () => {
    let resolveCallNext!: (res: Response) => void;
    const fetchMock = mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () => entriesResponse([]),
      [`POST /api/operator/queues/${OPEN_QUEUE.id}/call-next`]: () =>
        new Promise<Response>((resolve) => {
          resolveCallNext = resolve;
        }),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const user = userEvent.setup();

    const callNextBtn = await screen.findByRole('button', { name: 'Call Next' });
    await user.click(callNextBtn);

    const pendingBtn = await screen.findByRole('button', { name: /Calling next\.\.\./ });
    expect(pendingBtn).toBeDisabled();
    await user.click(pendingBtn);

    expect(callsTo(fetchMock, 'POST', `/api/operator/queues/${OPEN_QUEUE.id}/call-next`)).toHaveLength(1);

    await act(async () => resolveCallNext(new Response(null, { status: 204 })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Call Next' })).toBeEnabled());
  });

  it('handles 409 INVALID_STATE_TRANSITION by showing a safe conflict alert and refreshing queue entries', async () => {
    const calledEntry = makeEntry({
      id: ENTRY_ID,
      queueNumber: 9,
      status: 'CALLED',
      calledAt: '2026-11-13T09:00:00.000Z',
    });
    const alreadyServingEntry = {
      ...calledEntry,
      status: 'SERVING',
      serviceStartedAt: '2026-11-13T09:01:00.000Z',
    };

    let fetchCount = 0;
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () => {
        fetchCount += 1;
        return entriesResponse(fetchCount === 1 ? [calledEntry] : [alreadyServingEntry]);
      },
      [`POST /api/operator/queue-entries/${ENTRY_ID}/start`]: () =>
        errorResponse(409, 'INVALID_STATE_TRANSITION', 'SQL state error internal'),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const user = userEvent.setup();

    const startBtn = await screen.findByRole('button', { name: 'Start Service for queue number 9' });
    await user.click(startBtn);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This queue entry's status has changed. The queue has been refreshed."
    );
    expect(screen.queryByText(/SQL state error/)).not.toBeInTheDocument();

    // Queue automatically refreshed to show the entry is now In service
    const refreshedCard = await screen.findByTestId('active-entry-9');
    expect(within(refreshedCard).getByText('In service')).toBeInTheDocument();
  });

  it('shows 403 FORBIDDEN message when operator opens an unassigned queue (RBAC-004)', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${SECOND_QUEUE.id}/entries`]: () =>
        errorResponse(403, 'FORBIDDEN', 'You are not assigned to this queue.'),
    });

    renderApp(`/operator/queues/${SECOND_QUEUE.id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to manage this queue.'
    );
    expect(screen.queryByRole('button', { name: 'Call Next' })).not.toBeInTheDocument();
  });

  it('shows not-found message when queue does not exist (404) or id is malformed (400)', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      'GET /api/operator/queues/bad-uuid/entries': () =>
        errorResponse(400, 'INVALID_ARGUMENT', 'Malformed queueId'),
    });

    renderApp('/operator/queues/bad-uuid');

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find that service queue.");
  });

  it('distinguishes 403 CSRF verification failures from 403 RBAC permission errors on operator actions', async () => {
    const calledEntry = makeEntry({
      id: ENTRY_ID,
      queueNumber: 5,
      status: 'CALLED',
      calledAt: '2026-11-13T09:00:00.000Z',
    });

    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () => entriesResponse([calledEntry]),
      [`POST /api/operator/queues/${OPEN_QUEUE.id}/call-next`]: () =>
        errorResponse(403, 'FORBIDDEN', 'The request could not be verified.'),
      [`POST /api/operator/queue-entries/${ENTRY_ID}/start`]: () =>
        errorResponse(403, 'FORBIDDEN', 'You are not assigned to this queue.'),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Call Next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't verify this request. Please refresh the page or sign in again."
    );

    await user.click(screen.getByRole('button', { name: 'Start Service for queue number 5' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to perform this action.'
    );
  });

  it('distinguishes 404 queue-not-found on Call Next from 404 entry-not-found on Start Service', async () => {
    const calledEntry = makeEntry({
      id: ENTRY_ID,
      queueNumber: 6,
      status: 'CALLED',
      calledAt: '2026-11-13T09:00:00.000Z',
    });

    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
      [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () => entriesResponse([calledEntry]),
      [`POST /api/operator/queues/${OPEN_QUEUE.id}/call-next`]: () =>
        errorResponse(404, 'RESOURCE_NOT_FOUND', 'Service queue not found.'),
      [`POST /api/operator/queue-entries/${ENTRY_ID}/start`]: () =>
        errorResponse(404, 'RESOURCE_NOT_FOUND', 'Queue entry not found.'),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Call Next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find that service queue.");

    await user.click(screen.getByRole('button', { name: 'Start Service for queue number 6' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find that queue entry.");
  });

  it('redirects a customer attempting to open /operator/queues/:id to /customer', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
    });

    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);

    await waitFor(() => expect(location()).toBe('/customer'));
    expect(callsTo(fetchMock, 'GET', `/api/operator/queues/${OPEN_QUEUE.id}/entries`)).toHaveLength(0);
  });
});
