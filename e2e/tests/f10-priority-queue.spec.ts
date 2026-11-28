/**
 * F-10 E2E: PRIO-016, PRIO-017, PRIO-018 (docs/sprints/sprint-2/tests.md §9.1).
 * Screenshots go to docs/sprints/sprint-2/evidence/ (chromium only).
 */
import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { ApiUser, expectNoHorizontalOverflow, loginViaUi } from '../helpers/app';
import { ROOT_DIR } from '../helpers/env';
import {
  CUSTOMER1,
  CUSTOMER2,
  OPEN_QUEUE_ID,
  OPERATOR1,
  disconnectDb,
  resetDatabase,
  testDb,
} from '../helpers/db';

const EVIDENCE_DIR = path.join(ROOT_DIR, 'docs', 'sprints', 'sprint-2', 'evidence');
const WAITING_HELPER_NOTE = 'Queue position may adjust when priority customers are accommodated.';

async function f10Shot(page: Page, name: string): Promise<void> {
  if (test.info().project.name !== 'chromium') return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

async function entryPriorityDb(entryId: string): Promise<{ status: string; priority: string } | undefined> {
  const rows = await testDb().$queryRaw<Array<{ status: string; priority: string }>>`
    SELECT "status"::text AS status, "priority"::text AS priority
    FROM "QueueEntry"
    WHERE "id" = ${entryId}::uuid`;
  return rows[0];
}

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe('F-10 priority queue policy', () => {
  test('PRIO-016: operator promotes entry, persists across reload, calls next ahead of NORMAL, and customer views reflect priority', async ({
    page,
    browser,
  }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    const c2 = await ApiUser.login(CUSTOMER2.email);
    try {
      const n1 = await c1.join(OPEN_QUEUE_ID);
      const n2 = await c2.join(OPEN_QUEUE_ID);

      await loginViaUi(page, OPERATOR1.email);
      await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);

      // Promote customer2 (joined second) to PRIORITY.
      const waitN2 = page.getByTestId(`waiting-entry-${n2.queueNumber}`);
      await waitN2.getByRole('button', { name: `Set queue number ${n2.queueNumber} as priority` }).click();
      await expect(page.getByText(`Queue number ${n2.queueNumber} priority set to Priority.`).first()).toBeVisible();
      await expect(waitN2.getByTestId('priority-badge')).toHaveText('Priority');
      await f10Shot(page, 'f10-01-operator-waiting-priority');

      // Reload persists PRIORITY and keeps N2 first in Waiting Queue.
      await page.reload();
      const waitingItems = page.getByRole('list', { name: 'Waiting queue entries' }).getByRole('listitem');
      await expect(waitingItems.first()).toHaveAttribute('data-testid', `waiting-entry-${n2.queueNumber}`);
      await expect(waitingItems.nth(1)).toHaveAttribute('data-testid', `waiting-entry-${n1.queueNumber}`);
      expect(await entryPriorityDb(n2.id)).toEqual({ status: 'WAITING', priority: 'PRIORITY' });

      // Call Next at Counter 1 claims N2 ahead of N1.
      await page.getByRole('button', { name: 'Call next customer to Counter 1' }).click();
      const activeN2 = page.getByTestId(`active-entry-${n2.queueNumber}`);
      await expect(activeN2).toBeVisible();
      await expect(activeN2.getByTestId('priority-badge')).toHaveText('Priority');
      await expect(activeN2.getByText('Counter 1')).toBeVisible();

      // Customer2 sees read-only Priority badge and Counter 1 destination prompt; zero edit buttons.
      const c2Ctx = await browser.newContext();
      const c2Page = await c2Ctx.newPage();
      try {
        await loginViaUi(c2Page, CUSTOMER2.email);
        await c2Page.goto(`/customer/entries/${n2.id}`);
        await expect(c2Page.getByTestId('priority-badge')).toHaveText('Priority');
        await expect(c2Page.getByTestId('entry-message')).toHaveText('Please proceed to Counter 1.');
        await expect(c2Page.getByRole('button', { name: /priority/i })).toHaveCount(0);
        await f10Shot(c2Page, 'f10-02-customer-priority-called');
      } finally {
        await c2Ctx.close();
      }

      // Customer1 sees WAITING state and non-monotonic helper note.
      const c1Ctx = await browser.newContext();
      const c1Page = await c1Ctx.newPage();
      try {
        await loginViaUi(c1Page, CUSTOMER1.email);
        await c1Page.goto(`/customer/entries/${n1.id}`);
        await expect(c1Page.getByTestId('entry-message')).toHaveText('You are next');
        await expect(c1Page.getByText(WAITING_HELPER_NOTE)).toBeVisible();
        await expect(c1Page.getByTestId('priority-badge')).toHaveCount(0);
      } finally {
        await c1Ctx.close();
      }
    } finally {
      await c1.dispose();
      await c2.dispose();
    }
  });

  test('PRIO-017: F-08 recovery preserves PRIORITY, non-WAITING has no priority toggle, and stale 409 refreshes', async ({
    page,
  }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    const c2 = await ApiUser.login(CUSTOMER2.email);
    const opApi = await ApiUser.login(OPERATOR1.email);
    try {
      const n1 = await c1.join(OPEN_QUEUE_ID);
      const p1 = await c2.join(OPEN_QUEUE_ID);

      await loginViaUi(page, OPERATOR1.email);
      await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);

      // Promote P1 -> call at Counter 1 -> confirm no toggle on CALLED -> mark NO_SHOW -> recover -> call at Counter 2 ahead of N1.
      await page
        .getByTestId(`waiting-entry-${p1.queueNumber}`)
        .getByRole('button', { name: `Set queue number ${p1.queueNumber} as priority` })
        .click();

      await page.getByRole('button', { name: 'Call next customer to Counter 1' }).click();
      const activeP1 = page.getByTestId(`active-entry-${p1.queueNumber}`);
      await expect(activeP1.getByTestId('priority-badge')).toHaveText('Priority');
      await expect(activeP1.getByRole('button', { name: /priority/i })).toHaveCount(0);

      await activeP1.getByRole('button', { name: `Mark queue number ${p1.queueNumber} as no-show` }).click();
      const missedP1 = page.getByTestId(`no-show-entry-${p1.queueNumber}`);
      await expect(missedP1.getByTestId('priority-badge')).toHaveText('Priority');
      await expect(missedP1.getByRole('button', { name: /priority/i })).toHaveCount(0);

      await missedP1.getByRole('button', { name: `Return queue number ${p1.queueNumber} to the queue` }).click();
      const recoveredP1 = page.getByTestId(`waiting-entry-${p1.queueNumber}`);
      await expect(recoveredP1.getByTestId('priority-badge')).toHaveText('Priority');

      await page.getByRole('button', { name: 'Call next customer to Counter 2' }).click();
      await expect(page.getByTestId(`active-entry-${p1.queueNumber}`).getByText('Counter 2')).toBeVisible();

      // Stale 409 check: call N1 out-of-band via API, then click stale Set Priority button in UI.
      await opApi.callNext(OPEN_QUEUE_ID);
      await page
        .getByTestId(`waiting-entry-${n1.queueNumber}`)
        .getByRole('button', { name: `Set queue number ${n1.queueNumber} as priority` })
        .click();
      await expect(page.getByRole('alert')).toContainText(
        'This entry is no longer waiting, so its priority cannot be changed.'
      );
      await expect(page.getByTestId(`active-entry-${n1.queueNumber}`)).toBeVisible();
    } finally {
      await c1.dispose();
      await c2.dispose();
      await opApi.dispose();
    }
  });

  test('PRIO-018: keyboard-only priority toggle and zero horizontal overflow at 360 px and 1280 px', async ({
    page,
    browser,
  }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    try {
      const e = await c1.join(OPEN_QUEUE_ID);

      await loginViaUi(page, OPERATOR1.email);
      await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
      const toggle = page.getByRole('button', { name: `Set queue number ${e.queueNumber} as priority` });
      await expect(toggle).toBeVisible();

      // Keyboard-only activation via Tab/Enter.
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(`Queue number ${e.queueNumber} priority set to Priority.`).first()).toBeVisible();

      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await expectNoHorizontalOverflow(page);
        await f10Shot(page, `f10-03-operator-${width}`);
      }

      const cCtx = await browser.newContext();
      const cPage = await cCtx.newPage();
      try {
        await loginViaUi(cPage, CUSTOMER1.email);
        for (const route of ['/customer', `/customer/entries/${e.id}`]) {
          await cPage.goto(route);
          for (const width of [360, 1280]) {
            await cPage.setViewportSize({ width, height: 800 });
            await expectNoHorizontalOverflow(cPage);
            if (route.includes('/entries/')) {
              await f10Shot(cPage, `f10-04-customer-${width}`);
            }
          }
        }
      } finally {
        await cCtx.close();
      }
    } finally {
      await c1.dispose();
    }
  });
});
