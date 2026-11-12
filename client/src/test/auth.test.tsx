import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiRequest } from '../api/client';
import { CUSTOMER, OPERATOR, callsTo, errorResponse, jsonResponse, mockApi, renderApp } from './testUtils';

const SESSION_EXPIRED = 'Session expired. Please sign in again.';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText(/Email/), email);
  if (password) await user.type(screen.getByLabelText(/Password/), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

const location = () => screen.getByTestId('location').textContent;

describe('LoginPage', () => {
  it('validates required fields before submitting', async () => {
    const fetchMock = mockApi({});
    renderApp('/login');
    await screen.findByRole('button', { name: 'Sign in' });

    await fillAndSubmit('', '');

    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(callsTo(fetchMock, 'POST', '/api/auth/login')).toHaveLength(0);
  });

  it('shows the generic failure message in an alert and not the session-expired banner', async () => {
    mockApi({
      'POST /api/auth/login': () => errorResponse(401, 'UNAUTHORIZED', 'server detail that must not be shown'),
    });
    renderApp('/login');
    await screen.findByRole('button', { name: 'Sign in' });

    await fillAndSubmit('customer1@example.com', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.queryByText(SESSION_EXPIRED)).not.toBeInTheDocument();
    expect(screen.queryByText(/server detail/)).not.toBeInTheDocument();
    expect(location()).toBe('/login');
  });

  it('disables the submit button and shows "Signing in..." while the request is in flight', async () => {
    let resolveLogin!: (response: Response) => void;
    const fetchMock = mockApi({
      'POST /api/auth/login': () => new Promise<Response>((resolve) => (resolveLogin = resolve)),
    });
    renderApp('/login');
    await screen.findByRole('button', { name: 'Sign in' });

    const user = await fillAndSubmit('customer1@example.com', 'Password123!');

    const button = await screen.findByRole('button', { name: /Signing in\.\.\./ });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(callsTo(fetchMock, 'POST', '/api/auth/login')).toHaveLength(1);

    await act(async () => resolveLogin(jsonResponse(200, { data: { user: CUSTOMER } })));
    await waitFor(() => expect(location()).toBe('/customer'));
  });

  it.each([
    ['customer', CUSTOMER, '/customer'],
    ['operator', OPERATOR, '/operator'],
  ])('sends a signed-in %s to their home page', async (_label, account, home) => {
    const fetchMock = mockApi({ 'POST /api/auth/login': () => jsonResponse(200, { data: { user: account } }) });
    renderApp('/login');
    await screen.findByRole('button', { name: 'Sign in' });

    await fillAndSubmit(account.email, 'Password123!');

    await waitFor(() => expect(location()).toBe(home));
    expect(await screen.findByText(account.email)).toBeInTheDocument();
    // Login is anonymous: no CSRF header is required or sent.
    const [loginCall] = callsTo(fetchMock, 'POST', '/api/auth/login');
    expect(JSON.parse(String(loginCall.body))).toEqual({ email: account.email, password: 'Password123!' });
  });
});

describe('Route guards', () => {
  it('redirects an anonymous visitor from /customer to /login without the session-expired banner', async () => {
    mockApi({});
    renderApp('/customer');
    await waitFor(() => expect(location()).toBe('/login'));
    expect(screen.queryByText(SESSION_EXPIRED)).not.toBeInTheDocument();
  });

  it('redirects an anonymous visitor from /operator to /login', async () => {
    mockApi({});
    renderApp('/operator');
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('redirects a customer who opens /operator to /customer', async () => {
    mockApi({ 'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }) });
    renderApp('/operator');
    await waitFor(() => expect(location()).toBe('/customer'));
  });

  it('redirects an operator who opens /customer to /operator', async () => {
    mockApi({ 'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }) });
    renderApp('/customer');
    await waitFor(() => expect(location()).toBe('/operator'));
  });

  it('sends a signed-in user who opens /login to their home page', async () => {
    mockApi({ 'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }) });
    renderApp('/login');
    await waitFor(() => expect(location()).toBe('/operator'));
  });
});

describe('Session expiry (ui-spec §7)', () => {
  it('shows the exact banner and returns to /login when an authenticated request gets 401', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
      'POST /api/auth/logout': () => errorResponse(401, 'UNAUTHORIZED', 'Authentication is required.'),
    });
    renderApp('/customer');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByText(SESSION_EXPIRED)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(SESSION_EXPIRED);
    // Stale client state is cleared: the protected page is no longer reachable.
    expect(screen.queryByText(CUSTOMER.email)).not.toBeInTheDocument();
  });

  it('does not redirect again when the 401 happens while already on /login', async () => {
    const fetchMock = mockApi({
      'GET /api/protected-thing': () => errorResponse(401, 'UNAUTHORIZED'),
    });
    renderApp('/login');
    await screen.findByRole('button', { name: 'Sign in' });

    await act(async () => {
      await apiRequest('/api/protected-thing').catch(() => undefined);
    });

    expect(await screen.findByText(SESSION_EXPIRED)).toBeInTheDocument();
    expect(location()).toBe('/login');
    // Only the initial /me probe and the one failing request: no redirect loop of repeated calls.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a non-UNAUTHORIZED error (e.g. 403) does not trigger the session-expired flow', async () => {
    mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }),
      'POST /api/auth/logout': () => errorResponse(403, 'FORBIDDEN'),
    });
    renderApp('/customer');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Logout' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign out failed. Please try again.');
    expect(location()).toBe('/customer');
    expect(screen.queryByText(SESSION_EXPIRED)).not.toBeInTheDocument();
  });
});

describe('Logout', () => {
  it('sends the CSRF header from the qms_csrf cookie, clears state, and goes to /login without the banner', async () => {
    document.cookie = 'qms_csrf=test-csrf-token; path=/';
    const fetchMock = mockApi({
      'GET /api/auth/me': () => jsonResponse(200, { data: { user: OPERATOR } }),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    });
    renderApp('/operator');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(location()).toBe('/login'));
    const [logoutCall] = callsTo(fetchMock, 'POST', '/api/auth/logout');
    expect((logoutCall.headers as Record<string, string>)['X-CSRF-Token']).toBe('test-csrf-token');
    expect(screen.queryByText(SESSION_EXPIRED)).not.toBeInTheDocument();
    expect(screen.queryByText(OPERATOR.email)).not.toBeInTheDocument();
  });

  it('GET requests do not send the CSRF header', async () => {
    document.cookie = 'qms_csrf=test-csrf-token; path=/';
    const fetchMock = mockApi({ 'GET /api/auth/me': () => jsonResponse(200, { data: { user: CUSTOMER } }) });
    renderApp('/customer');
    await screen.findByText(CUSTOMER.email);
    const [meCall] = callsTo(fetchMock, 'GET', '/api/auth/me');
    expect((meCall.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
  });
});
