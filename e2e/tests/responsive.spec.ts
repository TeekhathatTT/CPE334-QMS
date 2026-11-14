/**
 * Issue #7 E2E scenario 9 — UI-001 (NFR-06): every Sprint 1 screen at 360 x 800 and 1280 x 800.
 * Pass criteria (tests.md UI-001): scrollWidth <= viewport width, no element crossing the viewport
 * edge, and the primary actions visible, inside the viewport horizontally and >= 44 px tall.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { ApiUser, expectNoHorizontalOverflow, loginViaUi, shot } from '../helpers/app';
import { CUSTOMER1, CUSTOMER2, OPEN_QUEUE_ID, OPERATOR1, disconnectDb, resetDatabase } from '../helpers/db';

test.afterAll(async () => {
  await disconnectDb();
});

async function expectActionUsable(page: Page, action: Locator, label: string): Promise<void> {
  await action.scrollIntoViewIfNeeded();
  await expect(action, label).toBeVisible();
  const box = await action.boundingBox();
  expect(box, `${label}: has a box`).not.toBeNull();
  const vw = page.viewportSize()!.width;
  expect(box!.x, `${label}: left edge inside viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${label}: right edge inside viewport`).toBeLessThanOrEqual(vw);
  expect(box!.height, `${label}: touch height`).toBeGreaterThanOrEqual(44);
}

/**
 * Data that fills every section of every screen:
 * customer1 has a COMPLETED entry and a new WAITING entry; customer2 is CALLED.
 */
async function seedAllStates(): Promise<{ waitingEntryId: string }> {
  await resetDatabase();
  const c1 = await ApiUser.login(CUSTOMER1.email);
  const c2 = await ApiUser.login(CUSTOMER2.email);
  const op = await ApiUser.login(OPERATOR1.email);
  const first = await c1.join();
  await op.callNext();
  expect(await op.post(`/api/operator/queue-entries/${first.id}/start`)).toBe(200);
  expect(await op.post(`/api/operator/queue-entries/${first.id}/complete`)).toBe(200);
  await c2.join();
  const waiting = await c1.join();
  await op.callNext(); // customer2 -> CALLED; customer1's new entry stays WAITING
  await Promise.all([c1.dispose(), c2.dispose(), op.dispose()]);
  return { waitingEntryId: waiting.id };
}

for (const width of [360, 1280] as const) {
  test(`S9 / UI-001 at ${width} x 800: login, customer and operator screens have no horizontal overflow and usable primary actions`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { waitingEntryId } = await seedAllStates();
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: width === 360 });
    const page = await ctx.newPage();
    const tag = `responsive-${width}`;
    const measured: string[] = [];
    const check = async (label: string) => {
      const r = await expectNoHorizontalOverflow(page, `${width}px ${label}`);
      measured.push(`${label}: scrollWidth=${r.scrollWidth} clientWidth=${r.clientWidth} innerWidth=${r.innerWidth}`);
    };

    // /login
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await check('/login');
    await expectActionUsable(page, page.getByLabel('Email'), 'Email input');
    await expectActionUsable(page, page.getByLabel('Password'), 'Password input');
    await expectActionUsable(page, page.getByRole('button', { name: 'Sign in' }), 'Sign in');
    await shot(page, `${tag}-01-login`, { fullPage: true });

    // /customer — Available Queues
    await loginViaUi(page, CUSTOMER1.email);
    await expect(page.getByRole('heading', { name: 'General Inquiry Desk' })).toBeVisible();
    await check('/customer (Available Queues)');
    await expectActionUsable(page, page.getByRole('tab', { name: 'Available Queues' }), 'Available Queues tab');
    await expectActionUsable(page, page.getByRole('tab', { name: 'My Active Tickets' }), 'My Active Tickets tab');
    await expectActionUsable(page, page.getByRole('button', { name: 'Join queue: General Inquiry Desk' }), 'Join Queue');
    await expectActionUsable(page, page.getByRole('button', { name: 'Logout' }), 'Logout');
    await shot(page, `${tag}-02-customer-queues`, { fullPage: true });

    // /customer — My Active Tickets (one WAITING, one COMPLETED)
    await page.getByRole('tab', { name: 'My Active Tickets' }).click();
    await expect(page.getByTestId('ticket')).toHaveCount(2);
    await check('/customer (My Active Tickets)');
    await expectActionUsable(page, page.getByRole('button', { name: 'Refresh' }), 'Refresh');
    const detailLinks = page.getByRole('link', { name: /^View details for queue number/ });
    for (let i = 0; i < 2; i++) await expectActionUsable(page, detailLinks.nth(i), `View details #${i + 1}`);
    await shot(page, `${tag}-03-customer-tickets`, { fullPage: true });

    // /customer/entries/:id
    await page.goto(`/customer/entries/${waitingEntryId}`);
    await expect(page.getByTestId('entry-queue-number')).toBeVisible();
    await check('/customer/entries/:id');
    await expectActionUsable(page, page.getByRole('link', { name: 'Back to my queues' }), 'Back to my queues');
    await expectActionUsable(page, page.getByRole('button', { name: 'Refresh' }), 'Refresh (detail)');
    await shot(page, `${tag}-04-customer-entry`, { fullPage: true });

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // /operator
    await loginViaUi(page, OPERATOR1.email);
    await expect(page.getByRole('heading', { name: 'General Inquiry Desk' })).toBeVisible();
    await check('/operator');
    await expectActionUsable(page, page.getByRole('link', { name: 'Manage queue: General Inquiry Desk' }), 'Manage queue');
    await expectActionUsable(page, page.getByRole('button', { name: 'Refresh' }), 'Refresh (operator)');
    await shot(page, `${tag}-05-operator-dashboard`, { fullPage: true });

    // /operator/queues/:id with Active, Waiting and Completed sections all populated
    await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
    await expect(page.getByTestId('active-count')).toHaveText('1');
    await expect(page.getByTestId('waiting-count')).toHaveText('1');
    await expect(page.getByTestId('completed-count')).toHaveText('1');
    await check('/operator/queues/:id');
    await expectActionUsable(page, page.getByRole('button', { name: 'Call Next' }), 'Call Next');
    await expectActionUsable(page, page.getByRole('button', { name: /^Start Service for queue number/ }), 'Start Service');
    await expectActionUsable(page, page.getByRole('button', { name: /^Complete Service for queue number/ }), 'Complete Service');
    await expectActionUsable(page, page.getByRole('link', { name: 'Back to assigned queues' }), 'Back to assigned queues');
    await shot(page, `${tag}-06-operator-queue`, { fullPage: true });

    // Recorded in the HTML/JSON report for the evidence README.
    test.info().annotations.push({ type: 'layout', description: measured.join(' | ') });
    await ctx.close();
  });
}
