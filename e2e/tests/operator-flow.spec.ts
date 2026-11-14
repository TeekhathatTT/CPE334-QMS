/**
 * Issue #7 E2E scenarios 3 and 4 (FLOW-010).
 */
import { test, expect } from '@playwright/test';
import { ApiUser, loginViaUi, shot } from '../helpers/app';
import {
  CUSTOMER1,
  CUSTOMER2,
  OPEN_QUEUE_ID,
  OPERATOR1,
  OPERATOR2,
  disconnectDb,
  resetDatabase,
  testDb,
} from '../helpers/db';

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

async function joinAs(email: string) {
  const api = await ApiUser.login(email);
  const entry = await api.join();
  await api.dispose();
  return entry;
}

test.describe('Operator workflow', () => {
  test('S3: operator sees only assigned queues and the FIFO waiting list; an unassigned operator sees none', async ({ page, browser }) => {
    const first = await joinAs(CUSTOMER1.email);
    const second = await joinAs(CUSTOMER2.email);

    await loginViaUi(page, OPERATOR1.email);
    await expect(page.getByRole('heading', { name: 'Assigned queues' })).toBeVisible();
    const assigned = page.getByRole('list', { name: 'Assigned queues' });
    await expect(assigned.getByRole('listitem')).toHaveCount(1);
    await expect(assigned.getByRole('heading', { name: 'General Inquiry Desk' })).toBeVisible();
    await expect(page.getByText('Specialized Consultation')).toHaveCount(0);
    await shot(page, 'operator-01-dashboard');

    await page.getByRole('link', { name: 'Manage queue: General Inquiry Desk' }).click();
    await expect(page).toHaveURL(new RegExp(`/operator/queues/${OPEN_QUEUE_ID}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'General Inquiry Desk' })).toBeVisible();
    await expect(page.getByTestId('waiting-count')).toHaveText('2');

    // FIFO: customer 1 (joined first) is position 1.
    const waiting = page.getByRole('list', { name: 'Waiting queue entries' }).getByRole('listitem');
    await expect(waiting).toHaveCount(2);
    await expect(waiting.nth(0)).toHaveAttribute('data-testid', `waiting-entry-${first.queueNumber}`);
    await expect(waiting.nth(0)).toContainText(CUSTOMER1.id);
    await expect(waiting.nth(0).getByLabel('Position 1')).toBeVisible();
    await expect(waiting.nth(1)).toHaveAttribute('data-testid', `waiting-entry-${second.queueNumber}`);
    await expect(waiting.nth(1)).toContainText(CUSTOMER2.id);
    await shot(page, 'operator-02-waiting-fifo');

    // Operator 2 is assigned to nothing: empty dashboard, and the queue URL is refused.
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();
    await loginViaUi(page2, OPERATOR2.email);
    await expect(page2.getByText('You have no assigned service queues.')).toBeVisible();
    await page2.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
    await expect(page2.getByRole('alert')).toHaveText(/You do not have permission to manage this queue\./);
    await expect(page2.getByRole('button', { name: 'Call Next' })).toHaveCount(0);
    await expect(page2.getByText(CUSTOMER1.id)).toHaveCount(0);
    await shot(page2, 'operator-07-unassigned-forbidden');
    await ctx2.close();
  });

  test('S4 / FLOW-010: Call Next -> CALLED, Start -> SERVING, Complete -> COMPLETED, with the UI updating after each step', async ({ page }) => {
    await joinAs(CUSTOMER1.email);

    await loginViaUi(page, OPERATOR1.email);
    await page.getByRole('link', { name: 'Manage queue: General Inquiry Desk' }).click();
    await expect(page.getByTestId('waiting-entry-1')).toBeVisible();
    await expect(page.getByText('No entries are currently called or in service.')).toBeVisible();

    // Call Next
    await page.getByRole('button', { name: 'Call Next' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Called queue number 1.' })).toBeVisible();
    const active = page.getByTestId('active-entry-1');
    await expect(active.locator('[data-status="CALLED"]')).toHaveText('Called');
    await expect(page.getByTestId('waiting-entry-1')).toHaveCount(0);
    const start = page.getByRole('button', { name: 'Start Service for queue number 1' });
    const complete = page.getByRole('button', { name: 'Complete Service for queue number 1' });
    await expect(start).toBeEnabled();
    await expect(complete).toBeDisabled();
    await shot(page, 'operator-03-called');

    // Start Service
    await start.click();
    await expect(page.getByRole('status').filter({ hasText: 'Started service for queue number 1.' })).toBeVisible();
    await expect(active.locator('[data-status="SERVING"]')).toHaveText('In service');
    await expect(start).toBeDisabled();
    await expect(complete).toBeEnabled();
    await shot(page, 'operator-04-serving');

    // Complete Service
    await complete.click();
    await expect(page.getByRole('status').filter({ hasText: 'Completed service for queue number 1.' })).toBeVisible();
    await expect(page.getByTestId('completed-entry-1').locator('[data-status="COMPLETED"]')).toHaveText('Completed');
    await expect(page.getByTestId('active-entry-1')).toHaveCount(0);
    await expect(page.getByTestId('completed-count')).toHaveText('1');
    await shot(page, 'operator-05-completed');

    // Empty Call Next: neutral message, nothing changes.
    await page.getByRole('button', { name: 'Call Next' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'No waiting entries to call right now.' })).toBeVisible();
    await expect(page.getByTestId('completed-entry-1')).toBeVisible();
    await shot(page, 'operator-06-empty-call-next');

    // DB agrees: one row, COMPLETED, every lifecycle timestamp set and ordered.
    const rows = await testDb().queueEntry.findMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.status).toBe('COMPLETED');
    const times = [row.joinedAt, row.calledAt, row.serviceStartedAt, row.completedAt].map((d) => d!.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
