/**
 * F-09 E2E: COUNTER-016, COUNTER-017, COUNTER-018 (docs/sprints/sprint-2/tests.md §8.1).
 * Screenshots go to docs/sprints/sprint-2/evidence/ (chromium only).
 */
import fs from 'fs';
import path from 'path';
import { test, expect, request as playwrightRequest, type Page } from '@playwright/test';
import { ApiUser, CLIENT_ORIGIN, expectNoHorizontalOverflow, loginViaUi } from '../helpers/app';
import { ROOT_DIR } from '../helpers/env';
import {
  CUSTOMER1,
  CUSTOMER2,
  OPEN_QUEUE_ID,
  OPERATOR1,
  SEED_PASSWORD,
  disconnectDb,
  resetDatabase,
  testDb,
} from '../helpers/db';

const EVIDENCE_DIR = path.join(ROOT_DIR, 'docs', 'sprints', 'sprint-2', 'evidence');
const COUNTER_Q1_1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const COUNTER_Q1_2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';

async function f09Shot(page: Page, name: string): Promise<void> {
  if (test.info().project.name !== 'chromium') return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

interface EntryDbRow {
  status: string;
  counterId: string | null;
}

async function entryDbRow(entryId: string): Promise<EntryDbRow | undefined> {
  const rows = await testDb().$queryRaw<EntryDbRow[]>`
    SELECT "status"::text AS status, "counterId"
    FROM "QueueEntry"
    WHERE "id" = ${entryId}::uuid`;
  return rows[0];
}

async function apiPatchCounterStatus(email: string, counterId: string, status: 'OPEN' | 'CLOSED'): Promise<number> {
  const ctx = await playwrightRequest.newContext({ baseURL: CLIENT_ORIGIN });
  try {
    const loginRes = await ctx.post('/api/auth/login', { data: { email, password: SEED_PASSWORD } });
    expect(loginRes.status()).toBe(200);
    const state = await ctx.storageState();
    const csrf = decodeURIComponent(state.cookies.find((c) => c.name === 'qms_csrf')?.value ?? '');
    const res = await ctx.patch(`/api/operator/counters/${counterId}/status`, {
      headers: { 'X-CSRF-Token': csrf },
      data: { status },
    });
    return res.status();
  } finally {
    await ctx.dispose();
  }
}

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe('F-09 multi-counter support', () => {
  test('COUNTER-016: multi-counter Call Next, counter close, in-flight finish, and customer destination view', async ({
    page,
    browser,
  }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    const c2 = await ApiUser.login(CUSTOMER2.email);
    try {
      const a = await c1.join(OPEN_QUEUE_ID);
      const b = await c2.join(OPEN_QUEUE_ID);

      await loginViaUi(page, OPERATOR1.email);
      await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
      await expect(page.getByRole('heading', { name: 'Counters (2)' })).toBeVisible();

      // Call customer1 at Counter 1 and customer2 at Counter 2.
      await page.getByRole('button', { name: 'Call next customer to Counter 1' }).click();
      await expect(page.getByText(`Called queue number ${a.queueNumber} to Counter 1.`).first()).toBeVisible();
      const activeA = page.getByTestId(`active-entry-${a.queueNumber}`);
      await expect(activeA.getByText('Counter 1')).toBeVisible();

      await page.getByRole('button', { name: 'Call next customer to Counter 2' }).click();
      await expect(page.getByText(`Called queue number ${b.queueNumber} to Counter 2.`).first()).toBeVisible();
      const activeB = page.getByTestId(`active-entry-${b.queueNumber}`);
      await expect(activeB.getByText('Counter 2')).toBeVisible();
      await f09Shot(page, 'f09-01-operator-two-counters-active');

      // Close Counter 2 -> Call Next on Counter 2 disabled, but customer2 can still Start & Complete.
      await page.getByRole('button', { name: 'Close Counter 2' }).click();
      await expect(page.getByText('Counter 2 is now Closed.').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Call next customer to Counter 2' })).toBeDisabled();

      await activeB.getByRole('button', { name: `Start Service for queue number ${b.queueNumber}` }).click();
      await expect(activeB.locator('[data-status="SERVING"]')).toHaveText('In service');
      await expect(activeB.getByText('Counter 2')).toBeVisible();

      await activeB.getByRole('button', { name: `Complete Service for queue number ${b.queueNumber}` }).click();
      const completedB = page.getByTestId(`completed-entry-${b.queueNumber}`);
      await expect(completedB).toBeVisible();
      // Nit #5: COMPLETED entries do not display a counter badge.
      await expect(completedB.getByText('Counter 2')).toHaveCount(0);

      expect(await entryDbRow(a.id)).toEqual({ status: 'CALLED', counterId: COUNTER_Q1_1 });
      expect(await entryDbRow(b.id)).toEqual({ status: 'COMPLETED', counterId: COUNTER_Q1_2 });

      // Customer1 sees "Please proceed to Counter 1." before and after reload.
      const customerCtx = await browser.newContext();
      const customerPage = await customerCtx.newPage();
      try {
        await loginViaUi(customerPage, CUSTOMER1.email);
        await customerPage.goto(`/customer/entries/${a.id}`);
        await expect(customerPage.getByTestId('entry-message')).toHaveText('Please proceed to Counter 1.');
        await expect(customerPage.getByText('Counter 1').first()).toBeVisible();
        await f09Shot(customerPage, 'f09-02-customer-called-counter1');

        await customerPage.reload();
        await expect(customerPage.getByTestId('entry-message')).toHaveText('Please proceed to Counter 1.');
        await expect(customerPage.getByText('Counter 1').first()).toBeVisible();
      } finally {
        await customerCtx.close();
      }
    } finally {
      await c1.dispose();
      await c2.dispose();
    }
  });

  test('COUNTER-017: operator 409 error feedback and F-08 recovery re-call at Counter 2', async ({ page, browser }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    try {
      const a = await c1.join(OPEN_QUEUE_ID);

      await loginViaUi(page, OPERATOR1.email);
      await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
      await expect(page.getByRole('heading', { name: 'Counters (2)' })).toBeVisible();

      // Call at Counter 1 -> mark NO_SHOW -> recover -> re-call at Counter 2.
      await page.getByRole('button', { name: 'Call next customer to Counter 1' }).click();
      await expect(page.getByTestId(`active-entry-${a.queueNumber}`).getByText('Counter 1')).toBeVisible();

      await page.getByTestId(`active-entry-${a.queueNumber}`).getByRole('button', { name: `Mark queue number ${a.queueNumber} as no-show` }).click();
      const missedA = page.getByTestId(`no-show-entry-${a.queueNumber}`);
      await expect(missedA).toBeVisible();
      await expect(missedA.getByText('Counter 1')).toHaveCount(0);

      await missedA.getByRole('button', { name: `Return queue number ${a.queueNumber} to the queue` }).click();
      await expect(page.getByTestId(`waiting-entry-${a.queueNumber}`)).toBeVisible();
      expect(await entryDbRow(a.id)).toEqual({ status: 'WAITING', counterId: null });

      await page.getByRole('button', { name: 'Call next customer to Counter 2' }).click();
      await expect(page.getByTestId(`active-entry-${a.queueNumber}`).getByText('Counter 2')).toBeVisible();
      expect(await entryDbRow(a.id)).toEqual({ status: 'CALLED', counterId: COUNTER_Q1_2 });

      // Empty queue on counter Call Next shows user-safe NO_WAITING_ENTRIES alert.
      await page.getByRole('button', { name: 'Call next customer to Counter 1' }).click();
      await expect(page.getByRole('alert')).toContainText('There are no waiting customers in this queue right now.');

      // Out-of-band close of Counter 1 -> stale click shows COUNTER_CLOSED alert and refreshes.
      expect(await apiPatchCounterStatus(OPERATOR1.email, COUNTER_Q1_1, 'CLOSED')).toBe(200);
      await page.getByRole('button', { name: 'Call next customer to Counter 1' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'This counter is closed. Open the counter before calling the next customer.'
      );
      await expect(page.getByRole('button', { name: 'Call next customer to Counter 1' })).toBeDisabled();

      // Customer sees Counter 2 (not stale Counter 1).
      const customerCtx = await browser.newContext();
      const customerPage = await customerCtx.newPage();
      try {
        await loginViaUi(customerPage, CUSTOMER1.email);
        await customerPage.goto(`/customer/entries/${a.id}`);
        await expect(customerPage.getByTestId('entry-message')).toHaveText('Please proceed to Counter 2.');
      } finally {
        await customerCtx.close();
      }
    } finally {
      await c1.dispose();
    }
  });

  test('COUNTER-018: keyboard-only counter toggle and Call Next; zero horizontal overflow at 360 px and 1280 px', async ({
    page,
    browser,
  }) => {
    const c1 = await ApiUser.login(CUSTOMER1.email);
    try {
      const a = await c1.join(OPEN_QUEUE_ID);

      await loginViaUi(page, OPERATOR1.email);
      await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
      await expect(page.getByRole('heading', { name: 'Counters (2)' })).toBeVisible();

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

      // Keyboard-only: Close Counter 2, Open Counter 2, Call Next at Counter 1.
      await tabTo('Close Counter 2');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Open Counter 2' })).toBeEnabled();

      await tabTo('Open Counter 2');
      await page.keyboard.press(' ');
      await expect(page.getByRole('button', { name: 'Close Counter 2' })).toBeEnabled();

      await tabTo('Call next customer to Counter 1');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId(`active-entry-${a.queueNumber}`).getByText('Counter 1')).toBeVisible();

      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
        await expect(page.getByRole('heading', { name: 'Counters (2)' })).toBeVisible();
        await expectNoHorizontalOverflow(page, `F-09 operator page at ${width}px`);
        await f09Shot(page, `f09-03-operator-${width}`);
      }

      const customerCtx = await browser.newContext();
      const customerPage = await customerCtx.newPage();
      try {
        await loginViaUi(customerPage, CUSTOMER1.email);
        for (const width of [360, 1280]) {
          await customerPage.setViewportSize({ width, height: 800 });
          await customerPage.goto(`/customer/entries/${a.id}`);
          await expect(customerPage.getByTestId('entry-message')).toHaveText('Please proceed to Counter 1.');
          await expectNoHorizontalOverflow(customerPage, `F-09 customer detail at ${width}px`);
          await f09Shot(customerPage, `f09-04-customer-${width}`);
        }
      } finally {
        await customerCtx.close();
      }
    } finally {
      await c1.dispose();
    }
  });

  test('COUNTER-019: zero-usable-counter legacy fallback (204 neutral empty message and Sprint 1 customer prompt)', async ({
    page,
    browser,
  }) => {
    // Remove counters on OPEN_QUEUE_ID so the queue has zero usable counters.
    await testDb().counter.deleteMany({ where: { serviceQueueId: OPEN_QUEUE_ID } });

    await loginViaUi(page, OPERATOR1.email);
    await page.goto(`/operator/queues/${OPEN_QUEUE_ID}`);
    await expect(page.getByText('No counters configured for this queue.')).toBeVisible();

    // Legacy queue-level Call Next is rendered and hits 204 neutral empty state (not a 409 alert).
    const legacyCallNextBtn = page.getByRole('button', { name: 'Call Next' });
    await expect(legacyCallNextBtn).toBeEnabled();
    await legacyCallNextBtn.click();
    await expect(page.getByRole('status').filter({ hasText: 'No waiting entries to call right now.' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Calling a waiting customer via the legacy fallback succeeds with counterId = null and Sprint 1 customer prompt.
    const c1 = await ApiUser.login(CUSTOMER1.email);
    try {
      const a = await c1.join(OPEN_QUEUE_ID);
      await legacyCallNextBtn.click();
      await expect(page.getByRole('status').filter({ hasText: `Called queue number ${a.queueNumber}.` })).toBeVisible();
      expect(await entryDbRow(a.id)).toEqual({ status: 'CALLED', counterId: null });

      const customerCtx = await browser.newContext();
      const customerPage = await customerCtx.newPage();
      try {
        await loginViaUi(customerPage, CUSTOMER1.email);
        await customerPage.goto(`/customer/entries/${a.id}`);
        await expect(customerPage.getByTestId('entry-message')).toHaveText('Please go to the service desk.');
        await expect(customerPage.getByTestId('entry-counter-badge')).toHaveCount(0);
      } finally {
        await customerCtx.close();
      }
    } finally {
      await c1.dispose();
    }
  });
});
