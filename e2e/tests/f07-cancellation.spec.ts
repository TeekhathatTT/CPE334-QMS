/**
 * F-07 E2E: CANCEL-017, CANCEL-018, CANCEL-019 (docs/sprints/sprint-2/tests.md).
 * Screenshots go to docs/sprints/sprint-2/evidence/ (chromium only), never to the Sprint 1 folder.
 */
import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { ApiUser, expectNoHorizontalOverflow, loginViaUi } from '../helpers/app';
import { ROOT_DIR } from '../helpers/env';
import { CUSTOMER1, OPEN_QUEUE_ID, OPERATOR1, disconnectDb, resetDatabase, testDb } from '../helpers/db';

const F07_EVIDENCE_DIR = path.join(ROOT_DIR, 'docs', 'sprints', 'sprint-2', 'evidence');

async function f07Shot(page: Page, name: string): Promise<void> {
  if (test.info().project.name !== 'chromium') return;
  fs.mkdirSync(F07_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(F07_EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function cancelledAtOf(entryId: string): Promise<string | null> {
  const rows = await testDb().$queryRaw<Array<{ status: string; cancelledAt: Date | null }>>`
    SELECT "status"::text AS status, "cancelledAt" FROM "QueueEntry" WHERE "id" = ${entryId}::uuid`;
  return rows[0]?.cancelledAt ? rows[0].cancelledAt.toISOString() : null;
}

async function statusOf(entryId: string): Promise<string | undefined> {
  const rows = await testDb().$queryRaw<Array<{ status: string }>>`
    SELECT "status"::text AS status FROM "QueueEntry" WHERE "id" = ${entryId}::uuid`;
  return rows[0]?.status;
}

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe('F-07 customer cancellation', () => {
  test('CANCEL-017: customer joins, cancels with confirmation, sees Cancelled after reload, and rejoins with a new number', async ({ page }) => {
    await loginViaUi(page, CUSTOMER1.email);
    await page.getByRole('button', { name: 'Join queue: General Inquiry Desk' }).click();
    const joinedPanel = page.getByRole('status').filter({ hasText: 'You joined General Inquiry Desk.' });
    await expect(page.getByTestId('joined-queue-number')).toHaveText('1');
    await joinedPanel.getByRole('link', { name: 'View details' }).click();

    const [entry] = await testDb().queueEntry.findMany({ where: { customerId: CUSTOMER1.id } });
    await expect(page).toHaveURL(new RegExp(`/customer/entries/${entry.id}$`));
    await expect(page.locator('article [data-status="WAITING"]')).toHaveText('Waiting');
    await f07Shot(page, 'f07-01-waiting-with-leave-button');

    // Confirmation step: "Keep my place" sends nothing.
    await page.getByRole('button', { name: 'Leave queue' }).click();
    const confirm = page.getByRole('group', { name: 'Confirm leaving the queue' });
    await expect(confirm).toContainText('Leave General Inquiry Desk? Queue number 1 will not be called');
    await f07Shot(page, 'f07-02-confirmation');
    await confirm.getByRole('button', { name: 'Keep my place' }).click();
    await expect(confirm).toHaveCount(0);
    expect(await statusOf(entry.id)).toBe('WAITING');

    // Confirm for real.
    await page.getByRole('button', { name: 'Leave queue' }).click();
    await page.getByRole('button', { name: 'Yes, leave queue' }).click();
    await expect(page.locator('article [data-status="CANCELLED"]')).toHaveText('Cancelled');
    await expect(page.getByTestId('entry-message')).toHaveText('You left this queue.');
    await expect(page.getByRole('button', { name: 'Leave queue' })).toHaveCount(0);
    expect(await statusOf(entry.id)).toBe('CANCELLED');
    const cancelledAt = await cancelledAtOf(entry.id);
    expect(cancelledAt).not.toBeNull();
    const cancelledRow = page.locator('article dl div').filter({ hasText: 'Cancelled:' });
    await expect(cancelledRow.locator('time')).toHaveAttribute('datetime', cancelledAt!);
    await f07Shot(page, 'f07-03-cancelled');

    // Persistence: same state after a full reload.
    await page.reload();
    await expect(page.locator('article [data-status="CANCELLED"]')).toHaveText('Cancelled');
    await expect(page.locator('article dl div').filter({ hasText: 'Cancelled:' }).locator('time')).toHaveAttribute('datetime', cancelledAt!);
    await f07Shot(page, 'f07-04-cancelled-after-reload');

    // Rejoin the same queue: new, larger number (BR-05 rev., BR-04).
    await page.getByRole('link', { name: /Back to my queues/ }).click();
    await page.getByRole('tab', { name: 'Available Queues' }).click();
    await page.getByRole('button', { name: 'Join queue: General Inquiry Desk' }).click();
    await expect(page.getByTestId('joined-queue-number')).toHaveText('2');
    await f07Shot(page, 'f07-05-rejoined-new-number');
    const rows = await testDb().queueEntry.findMany({ where: { customerId: CUSTOMER1.id }, orderBy: { queueNumber: 'asc' } });
    expect(rows.map((r) => [Number(r.queueNumber), r.status])).toEqual([
      [1, 'CANCELLED'],
      [2, 'WAITING'],
    ]);
  });

  test('CANCEL-018: after the operator calls the entry, Leave queue is gone and an API cancel is rejected with 409', async ({ page }) => {
    const customerApi = await ApiUser.login(CUSTOMER1.email);
    const operatorApi = await ApiUser.login(OPERATOR1.email);
    try {
      const entry = await customerApi.join(OPEN_QUEUE_ID);
      await loginViaUi(page, CUSTOMER1.email);
      await page.goto(`/customer/entries/${entry.id}`);
      await expect(page.getByRole('button', { name: 'Leave queue' })).toBeVisible();

      const called = await operatorApi.callNext(OPEN_QUEUE_ID);
      expect(called?.id).toBe(entry.id);
      await page.getByRole('button', { name: 'Refresh' }).click();

      await expect(page.locator('article [data-status="CALLED"]')).toHaveText('Called');
      await expect(page.getByRole('button', { name: 'Leave queue' })).toHaveCount(0);
      await f07Shot(page, 'f07-06-called-no-leave-button');

      // Server-side rule, not only the hidden button.
      expect(await customerApi.post(`/api/me/queue-entries/${entry.id}/cancel`)).toBe(409);
      expect(await statusOf(entry.id)).toBe('CALLED');
    } finally {
      await customerApi.dispose();
      await operatorApi.dispose();
    }
  });

  test('CANCEL-019: cancel with the keyboard only; no horizontal overflow at 360 px and 1280 px with the confirmation open', async ({ page }) => {
    const customerApi = await ApiUser.login(CUSTOMER1.email);
    try {
      const first = await customerApi.join(OPEN_QUEUE_ID);
      await loginViaUi(page, CUSTOMER1.email);
      await page.goto(`/customer/entries/${first.id}`);
      const leave = page.getByRole('button', { name: 'Leave queue' });
      await expect(leave).toBeVisible();

      // Reach the button with Tab only.
      await page.locator('body').focus();
      let reached = false;
      for (let i = 0; i < 40 && !reached; i++) {
        await page.keyboard.press('Tab');
        reached = await leave.evaluate((el) => el === document.activeElement);
      }
      expect(reached, 'Leave queue is reachable with Tab').toBe(true);

      await page.keyboard.press('Enter');
      const confirm = page.getByRole('group', { name: 'Confirm leaving the queue' });
      await expect(confirm).toBeVisible();
      await expect(confirm.getByRole('button', { name: 'Keep my place' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(confirm).toHaveCount(0);
      await expect(leave).toBeFocused();

      await page.keyboard.press('Enter');
      await expect(confirm.getByRole('button', { name: 'Keep my place' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(confirm.getByRole('button', { name: 'Yes, leave queue' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('article [data-status="CANCELLED"]')).toHaveText('Cancelled');
      expect(await statusOf(first.id)).toBe('CANCELLED');

      // Responsive check with the confirmation panel open on a fresh WAITING entry.
      const second = await customerApi.join(OPEN_QUEUE_ID);
      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/customer/entries/${second.id}`);
        await page.getByRole('button', { name: 'Leave queue' }).click();
        await expect(page.getByRole('group', { name: 'Confirm leaving the queue' })).toBeVisible();
        await expectNoHorizontalOverflow(page, `F-07 detail with confirmation at ${width}px`);
        await f07Shot(page, `f07-07-confirmation-${width}`);
      }
    } finally {
      await customerApi.dispose();
    }
  });
});
