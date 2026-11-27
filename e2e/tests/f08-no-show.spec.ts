/**
 * F-08 E2E: NOSHOW-017, NOSHOW-018, NOSHOW-019 (docs/sprints/sprint-2/tests.md §7.1).
 * Screenshots go to docs/sprints/sprint-2/evidence/ (chromium only), never to the Sprint 1 folder.
 */
import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { ApiUser, expectNoHorizontalOverflow, loginViaUi } from '../helpers/app';
import { ROOT_DIR } from '../helpers/env';
import { CUSTOMER1, CUSTOMER2, OPEN_QUEUE_ID, OPERATOR1, disconnectDb, resetDatabase, testDb } from '../helpers/db';

const EVIDENCE_DIR = path.join(ROOT_DIR, 'docs', 'sprints', 'sprint-2', 'evidence');

async function f08Shot(page: Page, name: string): Promise<void> {
  if (test.info().project.name !== 'chromium') return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

interface Row {
  status: string;
  noShowCount: number;
  noShowAt: Date | null;
  recoveredAt: Date | null;
  calledAt: Date | null;
}

async function rowOf(entryId: string): Promise<Row | undefined> {
  const rows = await testDb().$queryRaw<Row[]>`
    SELECT "status"::text AS status, "noShowCount", "noShowAt", "recoveredAt", "calledAt"
    FROM "QueueEntry" WHERE "id" = ${entryId}::uuid`;
  return rows[0];
}

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe('F-08 no-show handling and recovery', () => {
  test('NOSHOW-017: operator marks no-show, returns the entry to its place, then a second no-show is final', async ({ page }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    const c2 = await ApiUser.login(CUSTOMER2.email);
    try {
      const a = await c1.join(OPEN_QUEUE_ID);
      const b = await c2.join(OPEN_QUEUE_ID);

      await loginViaUi(page, OPERATOR1.email);
      await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
      await expect(page.getByRole('heading', { name: 'General Inquiry Desk' })).toBeVisible();

      await page.getByRole('button', { name: 'Call Next' }).click();
      const activeA = page.getByTestId(`active-entry-${a.queueNumber}`);
      await expect(activeA.locator('[data-status="CALLED"]')).toHaveText('Called');
      await f08Shot(page, 'f08-01-called-with-no-show-button');

      await activeA.getByRole('button', { name: `Mark queue number ${a.queueNumber} as no-show` }).click();
      await expect(page.getByText(`Marked queue number ${a.queueNumber} as no-show.`).first()).toBeVisible();
      const missedA = page.getByTestId(`no-show-entry-${a.queueNumber}`);
      await expect(missedA.locator('[data-status="NO_SHOW"]')).toHaveText('No-show');
      await expect(missedA.getByText('Missed:')).toBeVisible();
      await expect(page.getByTestId('no-show-count')).toHaveText('1');
      let stored = await rowOf(a.id);
      expect(stored?.status).toBe('NO_SHOW');
      expect(stored?.noShowCount).toBe(1);
      await f08Shot(page, 'f08-02-no-show-section');

      // B is served meanwhile; then A comes back.
      await page.getByRole('button', { name: 'Call Next' }).click();
      await expect(page.getByTestId(`active-entry-${b.queueNumber}`).locator('[data-status="CALLED"]')).toHaveText('Called');

      await missedA.getByRole('button', { name: `Return queue number ${a.queueNumber} to the queue` }).click();
      await expect(page.getByText(`Returned queue number ${a.queueNumber} to the queue.`).first()).toBeVisible();
      const waitingA = page.getByTestId(`waiting-entry-${a.queueNumber}`);
      await expect(waitingA.getByText('#1', { exact: true })).toBeVisible();
      await expect(waitingA.getByText('Returned to queue:')).toBeVisible();
      stored = await rowOf(a.id);
      expect(stored?.status).toBe('WAITING');
      expect(stored?.calledAt).toBeNull();
      expect(stored?.recoveredAt).not.toBeNull();
      await f08Shot(page, 'f08-03-returned-to-queue');

      // A is next again, and misses a second time.
      await page.getByRole('button', { name: 'Call Next' }).click();
      await expect(page.getByText(`Called queue number ${a.queueNumber}.`).first()).toBeVisible();
      await page.getByTestId(`active-entry-${a.queueNumber}`).getByRole('button', { name: `Mark queue number ${a.queueNumber} as no-show` }).click();
      const finalA = page.getByTestId(`no-show-entry-${a.queueNumber}`);
      await expect(finalA.getByText('Already returned once. This entry cannot be returned again.')).toBeVisible();
      await expect(finalA.getByRole('button')).toHaveCount(0);
      stored = await rowOf(a.id);
      expect(stored?.status).toBe('NO_SHOW');
      expect(stored?.noShowCount).toBe(2);
      await f08Shot(page, 'f08-04-second-no-show-final');

      // Server-side rule, not only the hidden button.
      const op = await ApiUser.login(OPERATOR1.email);
      try {
        expect(await op.post(`/api/operator/queue-entries/${a.id}/recover`)).toBe(409);
      } finally {
        await op.dispose();
      }
    } finally {
      await c1.dispose();
      await c2.dispose();
    }
  });

  test('NOSHOW-018: the customer sees No-show, then Waiting after the operator returns the entry', async ({ page }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    const op = await ApiUser.login(OPERATOR1.email);
    try {
      const a = await c1.join(OPEN_QUEUE_ID);
      expect((await op.callNext(OPEN_QUEUE_ID))?.id).toBe(a.id);
      expect(await op.post(`/api/operator/queue-entries/${a.id}/no-show`)).toBe(200);

      await loginViaUi(page, CUSTOMER1.email);
      await page.goto(`/customer/entries/${a.id}`);
      await expect(page.locator('article [data-status="NO_SHOW"]')).toHaveText('No-show');
      await expect(page.getByTestId('entry-message')).toHaveText(
        'You missed your turn. If you are still here, please go to the counter. Staff can return you to the queue once.'
      );
      await expect(page.locator('article dl div').filter({ hasText: 'Missed:' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Leave queue' })).toHaveCount(0);
      await f08Shot(page, 'f08-05-customer-no-show');

      expect(await op.post(`/api/operator/queue-entries/${a.id}/recover`)).toBe(200);
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(page.locator('article [data-status="WAITING"]')).toHaveText('Waiting');
      await expect(page.locator('article dl div').filter({ hasText: 'Returned to queue:' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Leave queue' })).toBeVisible();
      await f08Shot(page, 'f08-06-customer-returned');
    } finally {
      await c1.dispose();
      await op.dispose();
    }
  });

  test('NOSHOW-019: both actions with the keyboard only; no horizontal overflow at 360 px and 1280 px', async ({ page }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    const c2 = await ApiUser.login(CUSTOMER2.email);
    try {
      const a = await c1.join(OPEN_QUEUE_ID);
      await c2.join(OPEN_QUEUE_ID);
      await loginViaUi(page, OPERATOR1.email);
      await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
      await page.getByRole('button', { name: 'Call Next' }).click();
      await expect(page.getByText(`Called queue number ${a.queueNumber}.`).first()).toBeVisible();

      async function tabTo(name: string): Promise<void> {
        const target = page.getByRole('button', { name });
        await expect(target).toBeEnabled();
        await page.locator('body').focus();
        let reached = false;
        for (let i = 0; i < 60 && !reached; i++) {
          await page.keyboard.press('Tab');
          reached = await target.evaluate((el) => el === document.activeElement);
        }
        expect(reached, `${name} is reachable with Tab`).toBe(true);
      }

      await tabTo(`Mark queue number ${a.queueNumber} as no-show`);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId(`no-show-entry-${a.queueNumber}`)).toBeVisible();
      expect((await rowOf(a.id))?.status).toBe('NO_SHOW');

      // Responsive check with entries in Waiting and No-show.
      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
        await expect(page.getByTestId(`no-show-entry-${a.queueNumber}`)).toBeVisible();
        await expectNoHorizontalOverflow(page, `F-08 operator page at ${width}px`);
        await f08Shot(page, `f08-07-operator-${width}`);
      }

      await tabTo(`Return queue number ${a.queueNumber} to the queue`);
      await page.keyboard.press(' ');
      await expect(page.getByTestId(`waiting-entry-${a.queueNumber}`)).toBeVisible();
      expect((await rowOf(a.id))?.status).toBe('WAITING');
    } finally {
      await c1.dispose();
      await c2.dispose();
    }
  });
});
