/**
 * Issue #7 E2E scenarios 6, 7 and 8.
 *
 * Wrong-role handling: ui-spec §7 only defines the unauthenticated case. The implemented rule
 * (ProtectedRoute.tsx; covered by client tests) sends a signed-in user to their own home page.
 * These tests assert that implemented behaviour and that no API of the other role is called.
 */
import { test, expect, type Page } from '@playwright/test';
import { ApiUser, SESSION_EXPIRED_TEXT, loginViaUi, shot } from '../helpers/app';
import {
  CUSTOMER1,
  CUSTOMER2,
  OPEN_QUEUE_ID,
  OPERATOR1,
  deleteAllSessions,
  disconnectDb,
  resetDatabase,
} from '../helpers/db';

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

function recordApiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

test.describe('Authorization in the browser', () => {
  test('S6: a customer cannot reach operator screens, and an operator cannot reach customer screens', async ({ page, browser }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    const entry = await c1.join();
    await c1.dispose();

    // Customer on operator routes -> sent to /customer, no operator API call is made.
    await loginViaUi(page, CUSTOMER1.email);
    const customerCalls = recordApiCalls(page);
    await page.goto('/operator');
    await expect(page).toHaveURL(/\/customer$/);
    await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
    await expect(page).toHaveURL(/\/customer$/);
    await expect(page.getByRole('heading', { name: 'Your queues' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Call Next' })).toHaveCount(0);
    expect(customerCalls.filter((c) => c.includes('/api/operator/'))).toEqual([]);
    await shot(page, 'forbidden-customer-on-operator');

    // Operator on customer routes -> sent to /operator, no customer API call is made.
    const opCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const opPage = await opCtx.newPage();
    await loginViaUi(opPage, OPERATOR1.email);
    const operatorCalls = recordApiCalls(opPage);
    await opPage.goto('/customer');
    await expect(opPage).toHaveURL(/\/operator$/);
    await opPage.goto(`/customer/entries/${entry.id}`);
    await expect(opPage).toHaveURL(/\/operator$/);
    await expect(opPage.getByRole('heading', { name: 'Assigned queues' })).toBeVisible();
    expect(operatorCalls.filter((c) => c.includes('/api/me/'))).toEqual([]);
    await shot(opPage, 'forbidden-operator-on-customer');
    await opCtx.close();
  });

  test('S7: protected routes send anonymous visitors to /login; a session invalidated mid-use shows the session-expired banner', async ({ page }) => {
    // Anonymous: every protected route goes to /login without the banner.
    for (const path of [
      '/customer',
      '/customer/entries/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      '/operator',
      `/operator/queues/${OPEN_QUEUE_ID}`,
    ]) {
      await page.goto(path);
      await expect(page, `anonymous ${path}`).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByText(SESSION_EXPIRED_TEXT)).toHaveCount(0);
    }

    // Customer: session revoked server-side while the page is open; next request is 401.
    await loginViaUi(page, CUSTOMER1.email);
    await page.getByRole('tab', { name: 'My Active Tickets' }).click();
    await deleteAllSessions();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('status')).toHaveText(new RegExp(SESSION_EXPIRED_TEXT.replace('.', '\\.')));
    await expect(page.getByText(CUSTOMER1.email)).toHaveCount(0);
    await shot(page, 'session-expired-banner');

    // Re-opening the protected page does not work with stale client state.
    await page.goto('/customer');
    await expect(page).toHaveURL(/\/login$/);

    // The user can sign in again (ui-spec §7 item 8), and the banner clears.
    await loginViaUi(page, CUSTOMER1.email);
    await expect(page.getByText(SESSION_EXPIRED_TEXT)).toHaveCount(0);

    // Operator: same flow from the queue management screen.
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(SESSION_EXPIRED_TEXT)).toHaveCount(0); // a normal logout shows no banner
    await loginViaUi(page, OPERATOR1.email);
    await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
    await expect(page.getByRole('button', { name: 'Call Next' })).toBeVisible();
    await deleteAllSessions();
    await page.getByRole('button', { name: 'Call Next' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(SESSION_EXPIRED_TEXT)).toBeVisible();
  });

  test('S8: customer 2 opening customer 1\'s entry URL sees the not-found state and none of customer 1\'s data', async ({ page }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    const entry = await c1.join();
    await c1.dispose();

    await loginViaUi(page, CUSTOMER2.email);
    const detailResponse = page.waitForResponse((r) => r.url().endsWith(`/api/me/queue-entries/${entry.id}`));
    await page.goto(`/customer/entries/${entry.id}`);
    const res = await detailResponse;
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(JSON.stringify(body)).not.toContain(CUSTOMER1.id);

    await expect(page.getByRole('alert')).toHaveText(/We couldn't find that queue entry\./);
    await expect(page.getByTestId('entry-queue-number')).toHaveCount(0);
    await expect(page.locator('article')).toHaveCount(0);
    const text = await page.locator('body').innerText();
    expect(text).not.toContain(CUSTOMER1.id);
    expect(text).not.toContain(CUSTOMER1.email);
    expect(text).not.toContain(entry.id);
    await shot(page, 'cross-customer-not-found');
  });
});
