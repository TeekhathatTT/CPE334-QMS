/**
 * F-11 ANALYTICS-010 (operator analytics page rendering, default range, link from the queue page)
 * and ANALYTICS-011 (error, empty, validation and busy states).
 * Canonical STS: docs/sprints/sprint-3/tests.md §2.2; UI spec: docs/sprints/sprint-3/ui-spec.md §2.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  OPEN_QUEUE,
  OPERATOR,
  callsTo,
  entriesResponse,
  errorResponse,
  jsonResponse,
  mockApi,
  queuesResponse,
  renderApp,
  type RouteHandler,
} from './testUtils';

const BASE = `/api/operator/queues/${OPEN_QUEUE.id}/analytics`;
const url = (from: string, to: string) => `${BASE}?from=${from}&to=${to}`;
const PAGE = `/operator/queues/${OPEN_QUEUE.id}/analytics`;

/** 2026-11-28 12:00 in Asia/Bangkok, so the default range is 2026-11-22 .. 2026-11-28. */
const NOW = new Date('2026-11-28T05:00:00.000Z');
const DEFAULT_URL = url('2026-11-22', '2026-11-28');

const day = (date: string, o: Partial<Record<string, number | null>> = {}) => ({
  date,
  joined: 0,
  completed: 0,
  cancelled: 0,
  noShow: 0,
  averageWaitSeconds: null,
  averageServiceSeconds: null,
  ...o,
});

function report(from: string, to: string, overrides: Record<string, unknown> = {}) {
  return {
    queueId: OPEN_QUEUE.id,
    queueName: OPEN_QUEUE.name,
    from,
    to,
    timezone: 'Asia/Bangkok',
    volumes: { joined: 9, waiting: 1, called: 1, serving: 1, completed: 4, cancelled: 1, noShow: 1, recovered: 1, priority: 1 },
    waitTime: { count: 7, averageSeconds: 351.4, medianSeconds: 300, p90Seconds: 720, maxSeconds: 900 },
    serviceTime: { count: 4, averageSeconds: 570, medianSeconds: 540, p90Seconds: 810, maxSeconds: 900 },
    daily: [
      day('2026-11-20', { joined: 2, completed: 2, averageWaitSeconds: 210, averageServiceSeconds: 450 }),
      day('2026-11-21', { joined: 2, completed: 1, cancelled: 1, averageWaitSeconds: 600, averageServiceSeconds: 900 }),
      day('2026-11-22', { joined: 2, completed: 1, noShow: 1, averageWaitSeconds: 675, averageServiceSeconds: 480 }),
      day('2026-11-23'),
      day('2026-11-24', { joined: 1, averageWaitSeconds: 60 }),
      day('2026-11-25'),
      day('2026-11-26', { joined: 2, averageWaitSeconds: 30 }),
    ],
    ...overrides,
  };
}

const ok = (body: unknown) => jsonResponse(200, { data: { analytics: body } });

function emptyReport(from: string, to: string, days: string[]) {
  const empty = { count: 0, averageSeconds: null, medianSeconds: null, p90Seconds: null, maxSeconds: null };
  return report(from, to, {
    volumes: { joined: 0, waiting: 0, called: 0, serving: 0, completed: 0, cancelled: 0, noShow: 0, recovered: 0, priority: 0 },
    waitTime: empty,
    serviceTime: empty,
    daily: days.map((d) => day(d)),
  });
}

function mockOperator(extra: Record<string, RouteHandler>) {
  return mockApi({
    'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
    'GET /api/operator/queues': () => queuesResponse([OPEN_QUEUE]),
    [`GET /api/operator/queues/${OPEN_QUEUE.id}/entries`]: () => entriesResponse([]),
    ...extra,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  document.cookie = 'qms_csrf=operator-csrf-token; path=/';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('F-11 ANALYTICS-010: operator analytics page', () => {
  it('is linked from the operator queue workspace', async () => {
    mockOperator({ [`GET ${DEFAULT_URL}`]: () => ok(report('2026-11-22', '2026-11-28')) });
    renderApp(`/operator/queues/${OPEN_QUEUE.id}`);
    const link = await screen.findByRole('link', { name: `View analytics for ${OPEN_QUEUE.name}` });
    await userEvent.setup().click(link);
    expect(screen.getByTestId('location')).toHaveTextContent(PAGE);
    expect(await screen.findByRole('heading', { level: 1, name: `${OPEN_QUEUE.name} — Analytics` })).toBeInTheDocument();
  });

  it('loads the last 7 days by default and renders summary figures and the daily table', async () => {
    const fetchMock = mockOperator({ [`GET ${DEFAULT_URL}`]: () => ok(report('2026-11-20', '2026-11-26')) });
    renderApp(PAGE);

    expect(await screen.findByLabelText('From')).toHaveValue('2026-11-22');
    expect(screen.getByLabelText('To')).toHaveValue('2026-11-28');
    await screen.findByTestId('summary-joined');
    expect(callsTo(fetchMock, 'GET', DEFAULT_URL)).toHaveLength(1);

    expect(screen.getByTestId('summary-joined')).toHaveTextContent('9');
    expect(screen.getByTestId('summary-completed')).toHaveTextContent('4');
    expect(screen.getByTestId('summary-cancelled')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-noShow')).toHaveTextContent('1');
    expect(screen.getByTestId('wait-average')).toHaveTextContent('5m 51s');
    expect(screen.getByTestId('wait-median')).toHaveTextContent('5m 00s');
    expect(screen.getByTestId('wait-p90')).toHaveTextContent('12m 00s');
    expect(screen.getByTestId('service-average')).toHaveTextContent('9m 30s');
    expect(screen.getByTestId('service-median')).toHaveTextContent('9m 00s');
    expect(screen.getByTestId('service-p90')).toHaveTextContent('13m 30s');

    const table = screen.getByRole('table', { name: 'Daily breakdown, 2026-11-20 to 2026-11-26 (Asia/Bangkok)' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Date', 'Joined', 'Completed', 'Cancelled', 'No-show', 'Avg wait', 'Avg service']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(7);
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '2026-11-20', '2', '2', '0', '0', '3m 30s', '7m 30s',
    ]);
    expect(within(rows[3]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '2026-11-23', '0', '0', '0', '0', '—', '—',
    ]);
  });

  it('refetches with the chosen range and announces the update', async () => {
    const fetchMock = mockOperator({
      [`GET ${DEFAULT_URL}`]: () => ok(report('2026-11-22', '2026-11-28')),
      [`GET ${url('2026-11-20', '2026-11-26')}`]: () => ok(report('2026-11-20', '2026-11-26')),
    });
    renderApp(PAGE);
    await screen.findByTestId('summary-joined');
    const user = userEvent.setup();

    const from = screen.getByLabelText('From');
    const to = screen.getByLabelText('To');
    fireEvent.change(from, { target: { value: '2026-11-20' } });
    fireEvent.change(to, { target: { value: '2026-11-26' } });
    await user.click(screen.getByRole('button', { name: 'Show report' }));

    await waitFor(() => expect(callsTo(fetchMock, 'GET', url('2026-11-20', '2026-11-26'))).toHaveLength(1));
    expect(await screen.findByText('Report updated for 2026-11-20 to 2026-11-26.')).toBeInTheDocument();
  });

  it('shows — for null statistics and a note when no customers joined', async () => {
    mockOperator({ [`GET ${DEFAULT_URL}`]: () => ok(emptyReport('2026-11-22', '2026-11-28', ['2026-11-22', '2026-11-23'])) });
    renderApp(PAGE);
    expect(await screen.findByText('No customers joined this queue in the selected dates.')).toBeInTheDocument();
    expect(screen.getByTestId('summary-joined')).toHaveTextContent('0');
    expect(screen.getByTestId('wait-average')).toHaveTextContent('—');
    expect(screen.getByTestId('service-p90')).toHaveTextContent('—');
  });
});

describe('F-11 ANALYTICS-011: analytics error, validation and busy states', () => {
  it.each([
    [400, 'INVALID_ARGUMENT', 'Choose a valid date range of 31 days or fewer.'],
    [403, 'FORBIDDEN', 'You are not assigned to this queue.'],
    [404, 'RESOURCE_NOT_FOUND', "We couldn't find that queue."],
  ])('maps %i to a user-safe message', async (status, code, text) => {
    mockOperator({ [`GET ${DEFAULT_URL}`]: () => errorResponse(status, code) });
    renderApp(PAGE);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByTestId('summary-joined')).not.toBeInTheDocument();
  });

  it('shows a retryable error for server or network failures', async () => {
    let calls = 0;
    const fetchMock = mockOperator({
      [`GET ${DEFAULT_URL}`]: () => {
        calls += 1;
        return calls === 1 ? errorResponse(500, 'INTERNAL_ERROR') : ok(report('2026-11-22', '2026-11-28'));
      },
    });
    renderApp(PAGE);
    expect(await screen.findByText("We couldn't load the report. Please try again.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('summary-joined')).toHaveTextContent('9');
    expect(callsTo(fetchMock, 'GET', DEFAULT_URL)).toHaveLength(2);
  });

  it('blocks reversed and over-long ranges on the client without a request', async () => {
    const fetchMock = mockOperator({ [`GET ${DEFAULT_URL}`]: () => ok(report('2026-11-22', '2026-11-28')) });
    renderApp(PAGE);
    await screen.findByTestId('summary-joined');
    const user = userEvent.setup();
    const from = screen.getByLabelText('From');
    const to = screen.getByLabelText('To');

    fireEvent.change(from, { target: { value: '2026-11-29' } });
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(await screen.findByText('Start date must be on or before the end date.')).toBeInTheDocument();

    fireEvent.change(from, { target: { value: '2026-10-01' } });
    fireEvent.change(to, { target: { value: '2026-11-28' } });
    await user.click(screen.getByRole('button', { name: 'Show report' }));
    expect(await screen.findByText('Choose a range of 31 days or fewer.')).toBeInTheDocument();

    const analyticsCalls = fetchMock.mock.calls.filter(([input]) => String(input).startsWith(BASE));
    expect(analyticsCalls).toHaveLength(1);
  });

  it('disables the button and shows a busy label while loading', async () => {
    let resolve!: (r: Response) => void;
    mockOperator({ [`GET ${DEFAULT_URL}`]: () => new Promise<Response>((r) => (resolve = r)) });
    renderApp(PAGE);
    const button = await screen.findByRole('button', { name: 'Loading report…' });
    expect(button).toBeDisabled();
    resolve(ok(report('2026-11-22', '2026-11-28')));
    expect(await screen.findByRole('button', { name: 'Show report' })).toBeEnabled();
  });
});
