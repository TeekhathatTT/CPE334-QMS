/**
 * F-07 CANCEL-016: "Leave queue" control on the customer entry detail page.
 * Contract: docs/sprints/sprint-2/ui-spec.md §3, docs/sprints/sprint-2/tests.md.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CUSTOMER,
  ENTRY_ID,
  OPEN_QUEUE,
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

const DETAIL_PATH = `/api/me/queue-entries/${ENTRY_ID}`;
const CANCEL_PATH = `/api/me/queue-entries/${ENTRY_ID}/cancel`;
const CANCELLED_AT = '2026-11-27T09:04:12.345Z';
const CONFIRM_TEXT = `Leave ${OPEN_QUEUE.name}? Queue number 12 will not be called, and if you join again you will get a new number.`;
const STATUS_CHANGED = 'You can no longer leave this queue because your status has changed.';
const NOT_FOUND = "We couldn't find that queue entry.";
const NOT_VERIFIED = "We couldn't verify this request. Please refresh the page or sign in again.";
const GENERIC = 'Something went wrong. Please try again.';

const waiting = () => makeEntry({ status: 'WAITING', aheadCount: 2, cancelledAt: null });
const cancelled = () => makeEntry({ status: 'CANCELLED', aheadCount: 0, cancelledAt: CANCELLED_AT });

/** The detail GET returns whatever `state.entry` holds, so a test can change it between reads. */
function mockDetail(state: { entry: () => Response }, cancelHandler?: RouteHandler) {
  const routes: Record<string, RouteHandler> = {
    'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
    'GET /api/queues': () => queuesResponse([OPEN_QUEUE]),
    [`GET ${DETAIL_PATH}`]: () => state.entry(),
  };
  if (cancelHandler) routes[`POST ${CANCEL_PATH}`] = cancelHandler;
  return mockApi(routes);
}

const leaveButton = () => screen.queryByRole('button', { name: 'Leave queue' });
const confirmGroup = () => screen.queryByRole('group', { name: 'Confirm leaving the queue' });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('F-07 CANCEL-016: Leave queue control', () => {
  it('shows Leave queue only for a WAITING entry', async () => {
    mockDetail({ entry: () => entryResponse(waiting()) });
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByRole('button', { name: 'Leave queue' })).toBeInTheDocument();
  });

  it.each([
    ['CALLED', { calledAt: '2026-11-09T09:10:00.000Z' }],
    ['SERVING', { calledAt: '2026-11-09T09:10:00.000Z', serviceStartedAt: '2026-11-09T09:12:00.000Z' }],
    ['COMPLETED', { calledAt: '2026-11-09T09:10:00.000Z', serviceStartedAt: '2026-11-09T09:12:00.000Z', completedAt: '2026-11-09T09:30:00.000Z' }],
    ['CANCELLED', { cancelledAt: CANCELLED_AT }],
  ])('does not render Leave queue for a %s entry', async (status, fields) => {
    mockDetail({ entry: () => entryResponse(makeEntry({ status, aheadCount: 0, ...fields })) });
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByTestId('entry-queue-number')).toBeInTheDocument();
    expect(leaveButton()).not.toBeInTheDocument();
  });

  it('shows a CANCELLED entry as Cancelled with its cancel time and the terminal footer', async () => {
    mockDetail({ entry: () => entryResponse(cancelled()) });
    renderApp(`/customer/entries/${ENTRY_ID}`);
    expect(await screen.findByText('Cancelled', { selector: '[data-status]' })).toBeInTheDocument();
    expect(screen.getByTestId('entry-message')).toHaveTextContent(/^You left this queue\.$/);
    expect(screen.getByText('Cancelled:').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', CANCELLED_AT);
    expect(screen.getByText('You left this queue. This entry no longer updates.')).toBeInTheDocument();
  });

  it('asks for confirmation first; Keep my place and Escape close it without sending a request', async () => {
    const user = userEvent.setup();
    const fetchMock = mockDetail({ entry: () => entryResponse(waiting()) }, () => entryResponse(cancelled()));
    renderApp(`/customer/entries/${ENTRY_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Leave queue' }));
    const group = confirmGroup();
    expect(group).toBeInTheDocument();
    expect(within(group!).getByText(CONFIRM_TEXT)).toBeInTheDocument();
    const keep = within(group!).getByRole('button', { name: 'Keep my place' });
    expect(keep).toHaveFocus();
    expect(callsTo(fetchMock, 'POST', CANCEL_PATH)).toHaveLength(0);

    await user.click(keep);
    expect(confirmGroup()).not.toBeInTheDocument();
    expect(leaveButton()).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(confirmGroup()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(confirmGroup()).not.toBeInTheDocument();
    expect(leaveButton()).toHaveFocus();
    expect(callsTo(fetchMock, 'POST', CANCEL_PATH)).toHaveLength(0);
  });

  it('confirming sends one POST with the CSRF header, shows the busy state, then the Cancelled state', async () => {
    document.cookie = 'qms_csrf=customer-csrf-token; path=/';
    const user = userEvent.setup();
    const state = { entry: () => entryResponse(waiting()) };
    let release!: () => void;
    const fetchMock = mockDetail(state, () =>
      new Promise<Response>((resolve) => {
        release = () => {
          state.entry = () => entryResponse(cancelled());
          resolve(entryResponse(cancelled()));
        };
      })
    );
    renderApp(`/customer/entries/${ENTRY_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Leave queue' }));
    const yes = screen.getByRole('button', { name: 'Yes, leave queue' });
    await user.click(yes);

    // Busy: label changes, both buttons disabled, a second activation sends nothing.
    const busy = await screen.findByRole('button', { name: /Leaving queue\.\.\./ });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep my place' })).toBeDisabled();
    await user.click(busy);
    expect(callsTo(fetchMock, 'POST', CANCEL_PATH)).toHaveLength(1);
    expect((callsTo(fetchMock, 'POST', CANCEL_PATH)[0].headers as Record<string, string>)['X-CSRF-Token']).toBe('customer-csrf-token');

    release();

    expect(await screen.findByText('Cancelled', { selector: '[data-status]' })).toBeInTheDocument();
    expect(screen.getByTestId('entry-message')).toHaveTextContent(/^You left this queue\.$/);
    expect(screen.getByText('Cancelled:').nextElementSibling?.querySelector('time')).toHaveAttribute('dateTime', CANCELLED_AT);
    expect(leaveButton()).not.toBeInTheDocument();
    expect(confirmGroup()).not.toBeInTheDocument();
    expect(screen.getByTestId('status-announcer')).toHaveTextContent('You left the queue. Queue number 12 is now Cancelled.');
    expect(screen.getByRole('heading', { name: 'Queue entry' })).toHaveFocus();
    expect(callsTo(fetchMock, 'POST', CANCEL_PATH)).toHaveLength(1);
  });

  it.each([
    ['INVALID_STATE_TRANSITION'],
    ['CONCURRENT_MODIFICATION'],
  ])('409 %s shows the status-changed message and re-reads the entry (the control disappears when no longer WAITING)', async (code) => {
    const user = userEvent.setup();
    const state = { entry: () => entryResponse(waiting()) };
    const fetchMock = mockDetail(state, () => {
      state.entry = () => entryResponse(makeEntry({ status: 'CALLED', aheadCount: 0, calledAt: '2026-11-09T09:10:00.000Z', cancelledAt: null }));
      return errorResponse(409, code);
    });
    renderApp(`/customer/entries/${ENTRY_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Leave queue' }));
    await user.click(screen.getByRole('button', { name: 'Yes, leave queue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(STATUS_CHANGED);
    expect(await screen.findByText('Called', { selector: '[data-status]' })).toBeInTheDocument();
    expect(leaveButton()).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(STATUS_CHANGED);
    expect(callsTo(fetchMock, 'GET', DETAIL_PATH).length).toBeGreaterThanOrEqual(2);
  });

  it('404 shows the not-found message and the page falls back to the not-found state', async () => {
    const user = userEvent.setup();
    const state = { entry: () => entryResponse(waiting()) };
    mockDetail(state, () => {
      state.entry = () => errorResponse(404, 'RESOURCE_NOT_FOUND');
      return errorResponse(404, 'RESOURCE_NOT_FOUND');
    });
    renderApp(`/customer/entries/${ENTRY_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Leave queue' }));
    await user.click(screen.getByRole('button', { name: 'Yes, leave queue' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(NOT_FOUND));
    expect(screen.queryByTestId('entry-queue-number')).not.toBeInTheDocument();
  });

  it.each([
    [403, 'FORBIDDEN', NOT_VERIFIED],
    [500, 'INTERNAL_ERROR', GENERIC],
  ])('%s %s shows its message near the control and re-enables the buttons', async (status, code, message) => {
    const user = userEvent.setup();
    mockDetail({ entry: () => entryResponse(waiting()) }, () => errorResponse(status, code));
    renderApp(`/customer/entries/${ENTRY_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Leave queue' }));
    await user.click(screen.getByRole('button', { name: 'Yes, leave queue' }));

    const group = confirmGroup()!;
    expect(await within(group).findByRole('alert')).toHaveTextContent(message);
    expect(within(group).getByRole('button', { name: 'Yes, leave queue' })).toBeEnabled();
    expect(within(group).getByRole('button', { name: 'Keep my place' })).toBeEnabled();
    expect(screen.getByText('Waiting', { selector: '[data-status]' })).toBeInTheDocument();
  });

  it('a network failure shows the generic message', async () => {
    const user = userEvent.setup();
    mockDetail({ entry: () => entryResponse(waiting()) }, () => {
      throw new TypeError('Failed to fetch');
    });
    renderApp(`/customer/entries/${ENTRY_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Leave queue' }));
    await user.click(screen.getByRole('button', { name: 'Yes, leave queue' }));

    expect(await within(confirmGroup()!).findByRole('alert')).toHaveTextContent(GENERIC);
  });
});
