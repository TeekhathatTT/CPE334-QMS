/**
 * Keyboard-only walkthrough of both Sprint 1 workflows (ui-spec §8.1: visible focus, operable
 * controls). No mouse clicks are used after page load: only Tab, Enter, arrow keys, Home/End.
 *
 * Each control is reached by pressing Tab (bounded) and must match :focus-visible with a visible
 * ring (box-shadow or outline). Where focus lands after an action is recorded as an annotation,
 * not asserted, because ui-spec does not define it.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { ApiUser, shot } from '../helpers/app';
import { CUSTOMER1, OPERATOR1, SEED_PASSWORD, disconnectDb, resetDatabase } from '../helpers/db';

test.beforeEach(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

const TAB = 'Tab';

/**
 * WebKit keeps links (<a>) out of the Tab order by default (Safari's "Press Tab to highlight each
 * item" is off), and neither Tab nor Alt+Tab reaches them in Playwright's WebKit on Windows (both
 * were tried in #7). Both walkthroughs go through links, so they are skipped there with this
 * reason and reported as skipped, not passed.
 */
const WEBKIT_SKIP_REASON =
  'WebKit excludes links from the Tab order by default (Safari "Press Tab to highlight each item" off); not an app defect';

async function isFocused(target: Locator): Promise<boolean> {
  return target.evaluate((el) => el === document.activeElement).catch(() => false);
}

/** Presses Tab until `target` has focus, then checks the visible focus indicator. Returns the number of presses. */
async function tabTo(page: Page, key: string, target: Locator, label: string, max = 30): Promise<number> {
  await expect(target, `${label} exists`).toBeVisible();
  const seen: string[] = [];
  // Move backwards (Shift+Tab) when the target comes before the focused element in document order:
  // Firefox moves focus into the browser UI after the last control instead of wrapping around.
  const before = await target.evaluate((el) => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    return Boolean(active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
  });
  // When focus is on <body> (e.g. after a client-side navigation removed the focused element) the
  // direction is unknown, so a forward pass is followed by a backward pass if needed.
  const passes = before ? [`Shift+${key}`] : [key, `Shift+${key}`];
  let presses = 0;
  for (const press of passes) {
    for (let i = 1; i <= max; i++) {
      await page.keyboard.press(press);
      presses++;
      seen.push(await focusedDescription(page));
      if (await isFocused(target)) {
        const focus = await target.evaluate((el) => {
          const s = getComputedStyle(el);
          return { focusVisible: el.matches(':focus-visible'), boxShadow: s.boxShadow, outline: s.outlineStyle };
        });
        expect(focus.focusVisible, `${label} matches :focus-visible`).toBe(true);
        expect(focus.boxShadow !== 'none' || focus.outline !== 'none', `${label} shows a focus ring`).toBe(true);
        return presses;
      }
    }
  }
  throw new Error(`${label} was not reached by keyboard. Focus went: ${seen.slice(0, 16).join(' -> ')}`);
}

async function focusedDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return '<body> (focus lost)';
    return `<${el.tagName.toLowerCase()}> "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50)}"`;
  });
}

async function keyboardLogin(page: Page, key: string, email: string): Promise<void> {
  await page.goto('/login');
  await tabTo(page, key, page.getByLabel('Email'), 'Email');
  await page.keyboard.type(email);
  await tabTo(page, key, page.getByLabel('Password'), 'Password');
  await page.keyboard.type(SEED_PASSWORD);
  await page.keyboard.press('Enter');
}

test.describe('Keyboard-only operation', () => {
  test('customer: sign in, switch tabs, join, open details and go back using only the keyboard', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_SKIP_REASON);
    const key = TAB;
    const notes: string[] = [];

    await keyboardLogin(page, key, CUSTOMER1.email);
    await expect(page).toHaveURL(/\/customer$/);

    // Tabs: roving focus with arrow keys and Home/End.
    const queuesTab = page.getByRole('tab', { name: 'Available Queues' });
    const ticketsTab = page.getByRole('tab', { name: 'My Active Tickets' });
    await tabTo(page, key, queuesTab, 'Available Queues tab');
    await page.keyboard.press('ArrowRight');
    await expect(ticketsTab).toBeFocused();
    await expect(ticketsTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight'); // wraps around
    await expect(queuesTab).toBeFocused();
    await page.keyboard.press('End');
    await expect(ticketsTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(queuesTab).toHaveAttribute('aria-selected', 'true');

    // Join with Enter.
    const join = page.getByRole('button', { name: 'Join queue: General Inquiry Desk' });
    await tabTo(page, key, join, 'Join Queue');
    await shot(page, 'keyboard-01-customer-join-focused');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('joined-queue-number')).toHaveText('1');
    notes.push(`after Join: focus on ${await focusedDescription(page)}`);

    // Reach "View details" by keyboard and open it.
    const viewDetails = page.getByRole('status').filter({ hasText: 'You joined' }).getByRole('link', { name: 'View details' });
    const presses = await tabTo(page, key, viewDetails, 'View details');
    notes.push(`View details reached after ${presses} ${key} press(es)`);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/customer\/entries\//);
    await expect(page.getByTestId('entry-queue-number')).toHaveText('1');

    // Refresh and Back by keyboard.
    await tabTo(page, key, page.getByRole('link', { name: 'Back to my queues' }), 'Back to my queues');
    await tabTo(page, key, page.getByRole('button', { name: 'Refresh' }), 'Refresh');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('entry-queue-number')).toHaveText('1');
    await page.keyboard.press(`Shift+${key}`);
    await expect(page.getByRole('link', { name: 'Back to my queues' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/customer$/);

    // Sign out by keyboard.
    await tabTo(page, key, page.getByRole('button', { name: 'Logout' }), 'Logout');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/login$/);

    test.info().annotations.push({ type: 'focus', description: notes.join(' | ') });
  });

  test('operator: sign in, open the queue, call, start and complete using only the keyboard', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', WEBKIT_SKIP_REASON);
    const key = TAB;
    const notes: string[] = [];

    // The waiting customer is created through the API; this test is about the operator's keyboard path.
    const c1 = await ApiUser.login(CUSTOMER1.email);
    await c1.join();
    await c1.dispose();

    await keyboardLogin(page, key, OPERATOR1.email);
    await expect(page).toHaveURL(/\/operator$/);

    await tabTo(page, key, page.getByRole('link', { name: 'Manage queue: General Inquiry Desk' }), 'Manage queue');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('waiting-entry-1')).toBeVisible();

    await tabTo(page, key, page.getByRole('button', { name: 'Call Next' }), 'Call Next');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Called queue number 1.' })).toBeVisible();
    notes.push(`after Call Next: focus on ${await focusedDescription(page)}`);

    const start = page.getByRole('button', { name: 'Start Service for queue number 1' });
    await tabTo(page, key, start, 'Start Service');
    await shot(page, 'keyboard-02-operator-start-focused');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('active-entry-1').locator('[data-status="SERVING"]')).toBeVisible();
    notes.push(`after Start Service: focus on ${await focusedDescription(page)}`);

    // Disabled buttons are skipped in the tab order; Complete is now enabled and reachable.
    const complete = page.getByRole('button', { name: 'Complete Service for queue number 1' });
    await tabTo(page, key, complete, 'Complete Service');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('completed-entry-1').locator('[data-status="COMPLETED"]')).toBeVisible();
    notes.push(`after Complete Service: focus on ${await focusedDescription(page)}`);

    await tabTo(page, key, page.getByRole('link', { name: 'Back to assigned queues' }), 'Back to assigned queues');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/operator$/);

    test.info().annotations.push({ type: 'focus', description: notes.join(' | ') });
  });
});
