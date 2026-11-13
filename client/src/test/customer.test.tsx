import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CUSTOMER,
  ENTRY_ID,
  OPEN_QUEUE,
  OPERATOR,
  SECOND_QUEUE,
  UNLISTED_QUEUE_ID,
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

const SESSION_EXPIRED = 'Session expired. Please sign in again.';
const signedInCustomer = () => jsonResponse(200, { data: { user: CUSTOMER } });
const JOIN_PATH = `/api/queues/${OPEN_QUEUE.id}/entries`;
const location = () => screen.getByTestId('location').textContent;

function mockCustomer(routes: Record<string, RouteHandler> = {}) {
  return mockApi({
    'GET /api/auth/me': signedInCustomer,
    'GET /api/queues': () => queuesResponse([OPEN_QUEUE, SECOND_QUEUE]),
    ...routes,
  });
}

async function openTicketsTab() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: 'My Active Tickets' }));
  return user;
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

describe('Available Queues', () => {
  it('lists OPEN queues with name, description, and a text availability label', async () => {
    mockCustomer();
    renderApp('/customer');

    expect(await screen.findByRole('heading', { name: OPEN_QUEUE.name })).toBeInTheDocument();
    expect(screen.getByText(OPEN_QUEUE.description)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: SECOND_QUEUE.name })).toBeInTheDocument();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Open')).toBeInTheDocument();
    expect(within(cards[0]).getByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` })).toBeEnabled();
  });

  it('shows a loading state, then a neutral empty state', async () => {
    let resolve!: (response: Response) => void;
    mockCustomer({ 'GET /api/queues': () => new Promise<Response>((r) => (resolve = r)) });
    renderApp('/customer');

    expect(await screen.findByText('Loading queues...')).toBeInTheDocument();
    await act(async () => resolve(queuesResponse([])));
    expect(await screen.findByText('No queues are open right now.')).toBeInTheDocument();
  });

  it('shows a safe error with a retry that re-fetches the list', async () => {
    let fail = true;
    const fetchMock = mockCustomer({
      'GET /api/queues': () =>
        fail ? errorResponse(500, 'INTERNAL_ERROR', 'SELECT * FROM secret') : queuesResponse([OPEN_QUEUE]),
    });
    renderApp('/customer');

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the queues. Please try again.");
    expect(screen.queryByText(/SELECT/)).not.toBeInTheDocument();

    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: OPEN_QUEUE.name })).toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET', '/api/queues')).toHaveLength(2);
  });
});

describe('Join queue', () => {
  it('shows the queue name, number, and Waiting status, sends the CSRF cookie value, and re-fetches both lists', async () => {
    document.cookie = 'qms_csrf=customer-csrf-token; path=/';
    const joined = makeEntry({ queueNumber: 7 });
    const fetchMock = mockCustomer({ [`POST ${JOIN_PATH}`]: () => entryResponse(joined, 201) });
    renderApp('/customer');

    await userEvent.setup().click(await screen.findByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` }));

    const panel = (await screen.findByText(`You joined ${OPEN_QUEUE.name}.`)).closest('[role="status"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).getByTestId('joined-queue-number')).toHaveTextContent(/^7$/);
    expect(within(panel).getByText('Waiting')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      `/customer/entries/${ENTRY_ID}`
    );
    // Still on the Available Queues tab.
    expect(screen.getByRole('tab', { name: 'Available Queues' })).toHaveAttribute('aria-selected', 'true');

    const [post] = callsTo(fetchMock, 'POST', JOIN_PATH);
    expect((post.headers as Record<string, string>)['X-CSRF-Token']).toBe('customer-csrf-token');
    expect(post.body).toBeUndefined();
    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/api/queues')).toHaveLength(2));
    expect(callsTo(fetchMock, 'GET', '/api/me/queue-entries')).toHaveLength(2);
  });

  it('disables only the clicked button with "Joining queue..." and restores it afterwards', async () => {
    let resolve!: (response: Response) => void;
    mockCustomer({ [`POST ${JOIN_PATH}`]: () => new Promise<Response>((r) => (resolve = r)) });
    renderApp('/customer');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` }));

    const pending = screen.getByRole('button', { name: 'Joining queue...' });
    expect(pending).toBeDisabled();
    expect(screen.getByRole('button', { name: `Join queue: ${SECOND_QUEUE.name}` })).toBeEnabled();

    await act(async () => resolve(entryResponse(makeEntry(), 201)));
    expect(await screen.findByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` })).toBeEnabled();
    expect(screen.queryByText('Joining queue...')).not.toBeInTheDocument();
  });

  it('sends exactly one POST for a double click, even before the button re-renders', async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = mockCustomer({ [`POST ${JOIN_PATH}`]: () => new Promise<Response>((r) => (resolve = r)) });
    renderApp('/customer');
    const button = await screen.findByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` });

    // Both clicks land before React re-renders the disabled state: the in-flight guard must stop the second.
    act(() => {
      button.click();
      button.click();
    });
    await userEvent.setup().dblClick(screen.getByRole('button', { name: 'Joining queue...' }));
    expect(callsTo(fetchMock, 'POST', JOIN_PATH)).toHaveLength(1);

    await act(async () => resolve(entryResponse(makeEntry(), 201)));
    await screen.findByText(`You joined ${OPEN_QUEUE.name}.`);
    expect(callsTo(fetchMock, 'POST', JOIN_PATH)).toHaveLength(1);
  });

  it.each([
    [409, 'DUPLICATE_ACTIVE_ENTRY', 'You already have an active entry in this queue.', false],
    [409, 'QUEUE_NOT_AVAILABLE', 'This queue is not available right now.', true],
    [404, 'RESOURCE_NOT_FOUND', 'This queue is no longer available.', true],
    [403, 'FORBIDDEN', "We couldn't verify this request. Please refresh the page or sign in again.", false],
    [500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.', false],
  ])('maps %i %s to safe text and keeps the buttons enabled', async (status, code, text, refetches) => {
    const fetchMock = mockCustomer({
      [`POST ${JOIN_PATH}`]: () => errorResponse(status, code, 'internal server detail at line 42'),
    });
    renderApp('/customer');

    await userEvent.setup().click(await screen.findByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` }));

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByText(/internal server detail/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Join queue: ${SECOND_QUEUE.name}` })).toBeEnabled();
    expect(screen.queryByText(/You joined/)).not.toBeInTheDocument();
    // A CSRF/403 failure does not log the user out.
    expect(location()).toBe('/customer');
    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/api/queues')).toHaveLength(refetches ? 2 : 1));
    expect(callsTo(fetchMock, 'GET', '/api/me/queue-entries')).toHaveLength(1);
  });

  it('a network failure shows the generic message', async () => {
    mockCustomer({
      [`POST ${JOIN_PATH}`]: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderApp('/customer');
    await userEvent.setup().click(await screen.findByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('a 401 on join uses the global session-expired redirect', async () => {
    mockCustomer({ [`POST ${JOIN_PATH}`]: () => errorResponse(401, 'UNAUTHORIZED') });
    renderApp('/customer');
    await userEvent.setup().click(await screen.findByRole('button', { name: `Join queue: ${OPEN_QUEUE.name}` }));

    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByText(SESSION_EXPIRED)).toBeInTheDocument();
  });
});

describe('My Active Tickets', () => {
  it('lists entries newest first with mapped queue names, the fallback name, icon+text status, and detail links', async () => {
    const entries = [
      makeEntry({ id: 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', queueNumber: 3, status: 'CALLED', calledAt: '2026-11-09T09:05:00.000Z' }),
      makeEntry({ id: 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', serviceQueueId: UNLISTED_QUEUE_ID, queueNumber: 9 }),
      makeEntry({ id: 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3', queueNumber: 1, status: 'COMPLETED', completedAt: '2026-11-08T10:00:00.000Z' }),
    ];
    mockCustomer({ 'GET /api/me/queue-entries': () => entriesResponse(entries) });
    renderApp('/customer');
    await openTicketsTab();

    const tickets = await screen.findAllByTestId('ticket');
    expect(tickets).toHaveLength(3);

    expect(within(tickets[0]).getByRole('heading', { name: OPEN_QUEUE.name })).toBeInTheDocument();
    expect(within(tickets[0]).getByText('3')).toBeInTheDocument();
    expect(within(tickets[0]).getByText('Called')).toBeInTheDocument();
    expect(within(tickets[0]).getByText('Called:')).toBeInTheDocument();

    expect(within(tickets[1]).getByRole('heading', { name: 'Service queue' })).toBeInTheDocument();
    expect(within(tickets[1]).getByText('Waiting')).toBeInTheDocument();

    const completedBadge = within(tickets[2]).getByText('Completed', { selector: '[data-status]' });
    expect(completedBadge).toHaveAttribute('data-status', 'COMPLETED');
    expect(completedBadge.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    const joined = within(tickets[0]).getByText('Joined:').nextElementSibling?.querySelector('time');
    expect(joined).toHaveAttribute('dateTime', '2026-11-09T09:00:00.000Z');
    // aheadCount is not in the list payload and is not shown.
    expect(screen.queryByText(/ahead of you|You are next/)).not.toBeInTheDocument();

    expect(
      within(tickets[1]).getByRole('link', { name: 'View details for queue number 9 in Service queue' })
    ).toHaveAttribute('href', '/customer/entries/e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2');
  });

  it('opens the detail route from the list without calling the detail endpoint per item', async () => {
    const fetchMock = mockCustomer({
      'GET /api/me/queue-entries': () => entriesResponse([makeEntry()]),
      [`GET /api/me/queue-entries/${ENTRY_ID}`]: () => entryResponse(makeEntry({ aheadCount: 2 })),
    });
    renderApp('/customer');
    const user = await openTicketsTab();
    await screen.findAllByTestId('ticket');
    expect(callsTo(fetchMock, 'GET', `/api/me/queue-entries/${ENTRY_ID}`)).toHaveLength(0);

    await user.click(screen.getByRole('link', { name: /View details for queue number 12/ }));
    await waitFor(() => expect(location()).toBe(`/customer/entries/${ENTRY_ID}`));
    expect(await screen.findByText('Currently waiting. 2 people ahead of you.')).toBeInTheDocument();
  });

  it('shows a neutral empty state', async () => {
    mockCustomer();
    renderApp('/customer');
    await openTicketsTab();
    expect(await screen.findByText('You are not in any queue yet.')).toBeInTheDocument();
  });

  it('shows a safe error with retry when the first load fails', async () => {
    let fail = true;
    mockCustomer({
      'GET /api/me/queue-entries': () => (fail ? errorResponse(500, 'INTERNAL_ERROR') : entriesResponse([makeEntry()])),
    });
    renderApp('/customer');
    const user = await openTicketsTab();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your tickets. Please try again.");
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByTestId('ticket')).toHaveLength(1);
  });

  it('the Refresh button re-fetches from the API', async () => {
    const fetchMock = mockCustomer({ 'GET /api/me/queue-entries': () => entriesResponse([makeEntry()]) });
    renderApp('/customer');
    const user = await openTicketsTab();
    await screen.findAllByTestId('ticket');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/api/me/queue-entries')).toHaveLength(2));
  });
});

describe('Tabs and accessibility', () => {
  it('uses an accessible tablist operable with the arrow keys; Available Queues is the default', async () => {
    mockCustomer();
    renderApp('/customer');
    const queuesTab = await screen.findByRole('tab', { name: 'Available Queues' });
    const ticketsTab = screen.getByRole('tab', { name: 'My Active Tickets' });

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(queuesTab).toHaveAttribute('aria-selected', 'true');
    expect(queuesTab).toHaveAttribute('aria-controls', 'panel-queues');
    expect(ticketsTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-queues');

    const user = userEvent.setup();
    queuesTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(ticketsTab).toHaveAttribute('aria-selected', 'true');
    expect(ticketsTab).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-tickets');

    await user.keyboard('{ArrowLeft}');
    expect(queuesTab).toHaveAttribute('aria-selected', 'true');
    expect(queuesTab).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(ticketsTab).toHaveFocus();
  });

  it('renders a polite live region and accessible control names', async () => {
    mockCustomer();
    renderApp('/customer');
    await screen.findByRole('heading', { name: OPEN_QUEUE.name });
    expect(screen.getByTestId('status-announcer')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Join queue: ${SECOND_QUEUE.name}` })).toBeInTheDocument();
    expect(screen.getByText(CUSTOMER.email)).toBeInTheDocument();
  });
});

describe('My Active Tickets polling', () => {
  it('polls every 10 s only while the tickets tab is shown and the page is visible, and announces status changes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    stubVisibility('visible');
    let status = 'WAITING';
    const fetchMock = mockCustomer({
      'GET /api/me/queue-entries': () => entriesResponse([makeEntry({ status })]),
    });
    const { unmount } = renderApp('/customer');
    await screen.findByRole('heading', { name: OPEN_QUEUE.name });
    const listCalls = () => callsTo(fetchMock, 'GET', '/api/me/queue-entries').length;
    expect(listCalls()).toBe(1);

    // Available Queues tab: no polling.
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(listCalls()).toBe(1);

    await openTicketsTab();
    await screen.findAllByTestId('ticket');
    await act(async () => vi.advanceTimersByTimeAsync(9_999));
    expect(listCalls()).toBe(1);
    status = 'CALLED';
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await waitFor(() => expect(listCalls()).toBe(2));
    await waitFor(() =>
      expect(screen.getByTestId('status-announcer')).toHaveTextContent(
        `Queue number 12 in ${OPEN_QUEUE.name} is now Called.`
      )
    );
    expect(within(screen.getByTestId('ticket')).getByText('Called')).toBeInTheDocument();

    // Hidden page: no requests.
    stubVisibility('hidden');
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(listCalls()).toBe(2);
    stubVisibility('visible');
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await waitFor(() => expect(listCalls()).toBe(3));

    // Unmount clears the timer.
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(listCalls()).toBe(3);
  });

  it('keeps the last data and shows a retry note when a poll fails', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    stubVisibility('visible');
    let fail = false;
    mockCustomer({
      'GET /api/me/queue-entries': () => (fail ? errorResponse(500, 'INTERNAL_ERROR') : entriesResponse([makeEntry()])),
    });
    renderApp('/customer');
    await openTicketsTab();
    await screen.findAllByTestId('ticket');

    fail = true;
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(await screen.findByText('Could not refresh. Retrying...')).toBeInTheDocument();
    expect(screen.getAllByTestId('ticket')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fail = false;
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await waitFor(() => expect(screen.queryByText('Could not refresh. Retrying...')).not.toBeInTheDocument());
  });
});

describe('Customer route access', () => {
  it.each(['/customer', `/customer/entries/${ENTRY_ID}`])('sends an anonymous visitor from %s to /login', async (path) => {
    mockApi({});
    renderApp(path);
    await waitFor(() => expect(location()).toBe('/login'));
    expect(screen.queryByText(SESSION_EXPIRED)).not.toBeInTheDocument();
  });

  it.each(['/customer', `/customer/entries/${ENTRY_ID}`])('redirects an operator from %s to /operator', async (path) => {
    const fetchMock = mockApi({ 'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }) });
    renderApp(path);
    await waitFor(() => expect(location()).toBe('/operator'));
    expect(callsTo(fetchMock, 'GET', `/api/me/queue-entries/${ENTRY_ID}`)).toHaveLength(0);
    expect(callsTo(fetchMock, 'GET', '/api/me/queue-entries')).toHaveLength(0);
  });
});
