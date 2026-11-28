/**
 * F-11 E2E: ANALYTICS-012 (docs/sprints/sprint-3/tests.md §2.2, AC-62).
 * Screenshots go to docs/sprints/sprint-3/evidence/ (chromium only).
 */
import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { ApiUser, expectNoHorizontalOverflow, loginViaUi } from '../helpers/app';
import { ROOT_DIR } from '../helpers/env';
import { CUSTOMER1, OPEN_QUEUE_ID, OPERATOR1, disconnectDb, resetDatabase } from '../helpers/db';

const EVIDENCE_DIR = path.join(ROOT_DIR, 'docs', 'sprints', 'sprint-3', 'evidence');

async function f11Shot(page: Page, name: string): Promise<void> {
  if (test.info().project.name !== 'chromium') return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: true });
}

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe('F-11 operational analytics', () => {
  test('ANALYTICS-012: operator opens analytics from the queue, sees today’s completed journey, keyboard and 360/1280 layouts', async ({
    page,
  }) => {
    // Create data for today: one full lifecycle (join -> call -> start -> complete).
    const customer = await ApiUser.login(CUSTOMER1.email);
    const operator = await ApiUser.login(OPERATOR1.email);
    try {
      const entry = await customer.join(OPEN_QUEUE_ID);
      const called = await operator.callNext(OPEN_QUEUE_ID);
      expect(called?.id).toBe(entry.id);
      expect(await operator.post(`/api/operator/queue-entries/${entry.id}/start`)).toBe(200);
      expect(await operator.post(`/api/operator/queue-entries/${entry.id}/complete`)).toBe(200);
    } finally {
      await customer.dispose();
      await operator.dispose();
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await loginViaUi(page, OPERATOR1.email);
    await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
    await page.getByRole('link', { name: 'View analytics for General Inquiry Desk' }).click();
    await expect(page).toHaveURL(new RegExp(`/operator/queues/${OPEN_QUEUE_ID}/analytics$`));
    await expect(page.getByRole('heading', { level: 1, name: 'General Inquiry Desk — Analytics' })).toBeVisible();

    await expect(page.getByTestId('summary-joined')).toHaveText('1');
    await expect(page.getByTestId('summary-completed')).toHaveText('1');
    await expect(page.getByTestId('wait-average')).not.toHaveText('—');
    await expect(page.getByTestId('service-average')).not.toHaveText('—');
    await expect(page.getByRole('table', { name: /Daily breakdown/ }).getByRole('row')).toHaveCount(8);
    await expectNoHorizontalOverflow(page, 'analytics 1280');
    await f11Shot(page, 'f11-01-operator-analytics-1280');

    // Keyboard only: Tab forward from the To field until the button has focus (date inputs may
    // expose several segment tab stops depending on the browser), then press Enter.
    await page.getByLabel('To', { exact: true }).focus();
    const button = page.getByRole('button', { name: 'Show report' });
    for (let i = 0; i < 6 && !(await button.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/^Report updated for /)).toBeAttached();

    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.getByTestId('summary-joined')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'analytics 360');
    await f11Shot(page, 'f11-02-operator-analytics-360');
  });
});
