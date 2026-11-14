/**
 * Issue #7 E2E scenarios 1, 2 and 5 (FLOW-009 and the customer side of FLOW-010).
 */
import { test, expect } from '@playwright/test';
import { ApiUser, loginViaUi, shot } from '../helpers/app';
import { CUSTOMER1, OPEN_QUEUE_ID, OPERATOR1, disconnectDb, resetDatabase, testDb } from '../helpers/db';

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe('Customer workflow', () => {
  test('S1 / FLOW-009: customer logs in, sees available queues, joins, gets a number, and views own WAITING entry', async ({ page }) => {
    await loginViaUi(page, CUSTOMER1.email, { screenshot: 'customer-01-login' });

    // Available Queues tab: only the OPEN queue is offered.
    await expect(page.getByRole('heading', { name: 'Your queues' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Available Queues' })).toHaveAttribute('aria-selected', 'true');
    const openQueues = page.getByRole('list', { name: 'Open queues' });
    await expect(openQueues.getByRole('listitem')).toHaveCount(1);
    await expect(openQueues.getByRole('heading', { name: 'General Inquiry Desk' })).toBeVisible();
    await expect(page.getByText('Specialized Consultation')).toHaveCount(0);
    await shot(page, 'customer-02-queues');

    // Join.
    await page.getByRole('button', { name: 'Join queue: General Inquiry Desk' }).click();
    await expect(page.getByText('You joined General Inquiry Desk.')).toBeVisible();
    await expect(page.getByTestId('joined-queue-number')).toHaveText('1');
    const joinedPanel = page.getByRole('status').filter({ hasText: 'You joined General Inquiry Desk.' });
    await expect(joinedPanel.locator('[data-status="WAITING"]')).toHaveText('Waiting');
    await shot(page, 'customer-03-joined');

    // Persisted exactly once, as WAITING with number 1.
    const rows = await testDb().queueEntry.findMany({ where: { customerId: CUSTOMER1.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'WAITING', queueNumber: 1n, serviceQueueId: OPEN_QUEUE_ID });

    // Detail page.
    await joinedPanel.getByRole('link', { name: 'View details' }).click();
    await expect(page).toHaveURL(new RegExp(`/customer/entries/${rows[0].id}$`));
    await expect(page.getByRole('heading', { name: 'Queue entry' })).toBeVisible();
    await expect(page.getByTestId('entry-queue-number')).toHaveText('1');
    await expect(page.getByRole('heading', { level: 2, name: 'General Inquiry Desk' })).toBeVisible();
    await expect(page.locator('article [data-status="WAITING"]')).toHaveText('Waiting');
    await expect(page.getByTestId('entry-message')).toHaveText('You are next');
    // Registration time: "Joined:" with a machine-readable timestamp equal to the DB value.
    const joined = page.locator('article dl div').filter({ hasText: 'Joined:' });
    await expect(joined).toBeVisible();
    await expect(joined.locator('time')).toHaveAttribute('datetime', rows[0].joinedAt.toISOString());
    // Lifecycle timestamps that are not set yet are not shown.
    await expect(page.locator('article dt', { hasText: 'Called:' })).toHaveCount(0);
    await shot(page, 'customer-04-detail-waiting');
  });

  test('S2: joining the same queue again shows the duplicate error and creates no second entry', async ({ page }) => {
    await loginViaUi(page, CUSTOMER1.email);
    const join = page.getByRole('button', { name: 'Join queue: General Inquiry Desk' });

    await join.click();
    await expect(page.getByTestId('joined-queue-number')).toHaveText('1');
    await expect(join).toBeEnabled();

    const joinResponse = page.waitForResponse((r) => r.url().endsWith(`/api/queues/${OPEN_QUEUE_ID}/entries`));
    await join.click();
    expect((await joinResponse).status()).toBe(409);
    await expect(page.getByRole('alert')).toHaveText(/You already have an active entry in this queue\./);
    await expect(join).toBeEnabled(); // form stays usable (ui-spec §7)
    await shot(page, 'customer-05-duplicate-rejected');

    // DB: still exactly one entry, counter not advanced by the rejected attempt.
    const db = testDb();
    expect(await db.queueEntry.count({ where: { customerId: CUSTOMER1.id } })).toBe(1);
    expect((await db.serviceQueue.findUniqueOrThrow({ where: { id: OPEN_QUEUE_ID } })).lastQueueNumber).toBe(1n);

    // UI: My Active Tickets lists exactly one ticket.
    await page.getByRole('tab', { name: 'My Active Tickets' }).click();
    await expect(page.getByTestId('ticket')).toHaveCount(1);
  });

  test('S5: customer detail page shows each operator change through real 10 s polling, without a reload', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const customerApi = await ApiUser.login(CUSTOMER1.email);
    const entry = await customerApi.join();
    await customerApi.dispose();

    await loginViaUi(page, CUSTOMER1.email);
    await page.goto(`/customer/entries/${entry.id}`);
    await expect(page.locator('article [data-status="WAITING"]')).toBeVisible();
    const navigations: string[] = [];
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) navigations.push(f.url());
    });

    // Operator acts in a separate browser context (separate cookies), through the real UI.
    const opContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const opPage = await opContext.newPage();
    await loginViaUi(opPage, OPERATOR1.email);
    await opPage.goto(`/operator/queues/${OPEN_QUEUE_ID}`);

    const POLL_WINDOW = { timeout: 15_000 }; // REFRESH_INTERVAL_MS is 10 s; allow one interval + margin

    await opPage.getByRole('button', { name: 'Call Next' }).click();
    await expect(opPage.getByRole('status').filter({ hasText: 'Called queue number 1.' })).toBeVisible();
    await expect(page.locator('article [data-status="CALLED"]')).toHaveText('Called', POLL_WINDOW);
    await expect(page.getByTestId('entry-message')).toHaveText('Please go to the service desk.');
    await expect(page.getByTestId('status-announcer')).toContainText('is now Called');
    await shot(page, 'customer-06-sees-called');

    await opPage.getByRole('button', { name: 'Start Service for queue number 1' }).click();
    await expect(page.locator('article [data-status="SERVING"]')).toHaveText('In service', POLL_WINDOW);
    await expect(page.getByTestId('entry-message')).toHaveText('Your service is in progress.');

    await opPage.getByRole('button', { name: 'Complete Service for queue number 1' }).click();
    await expect(page.locator('article [data-status="COMPLETED"]')).toHaveText('Completed', POLL_WINDOW);
    await expect(page.getByTestId('entry-message')).toHaveText('Service completed.');
    await expect(page.getByText('This entry is complete and no longer updates.')).toBeVisible();
    for (const label of ['Joined:', 'Called:', 'Service started:', 'Completed:']) {
      await expect(page.locator('article dt', { hasText: label })).toBeVisible();
    }
    await shot(page, 'customer-07-sees-completed');

    // The updates came from polling, not from a navigation or reload.
    expect(navigations).toEqual([]);
    await opContext.close();
  });
});
