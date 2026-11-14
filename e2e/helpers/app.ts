/**
 * Browser and API helpers. Every selector uses text the UI really renders (read from
 * client/src/pages and client/src/components); nothing is guessed.
 */
import fs from 'fs';
import path from 'path';
import { expect, test, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
import { ROOT_DIR } from './env';
import { OPEN_QUEUE_ID, SEED_PASSWORD } from './db';

export const EVIDENCE_DIR = path.join(ROOT_DIR, 'docs', 'sprints', 'sprint-1', 'evidence');
export const CLIENT_ORIGIN = 'http://localhost:5173';
export const SESSION_EXPIRED_TEXT = 'Session expired. Please sign in again.';

/**
 * Viewport (not full-page) PNG with a deterministic name in the evidence folder.
 * Only the chromium project writes evidence, so other browsers never overwrite it.
 */
export async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<void> {
  if (test.info().project.name !== 'chromium') return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: opts.fullPage ?? false });
}

/** Signs in through the real login form (LoginPage.tsx) and waits for the role home. */
export async function loginViaUi(page: Page, email: string, opts: { screenshot?: string } = {}): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(SEED_PASSWORD);
  if (opts.screenshot) await shot(page, opts.screenshot);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const home = email.startsWith('operator') ? '/operator' : '/customer';
  await expect(page).toHaveURL(new RegExp(`${home}$`));
}

/**
 * An API session that goes through the Vite proxy exactly like the browser does: same origin,
 * real session cookie, real CSRF token from the `qms_csrf` cookie.
 */
export class ApiUser {
  private constructor(private readonly ctx: APIRequestContext, private readonly csrf: string) {}

  static async login(email: string): Promise<ApiUser> {
    const ctx = await playwrightRequest.newContext({ baseURL: CLIENT_ORIGIN });
    const res = await ctx.post('/api/auth/login', { data: { email, password: SEED_PASSWORD } });
    expect(res.status(), `API login for ${email}`).toBe(200);
    const state = await ctx.storageState();
    const csrf = state.cookies.find((c) => c.name === 'qms_csrf')?.value;
    if (!csrf) throw new Error('login did not set qms_csrf');
    return new ApiUser(ctx, decodeURIComponent(csrf));
  }

  async join(queueId = OPEN_QUEUE_ID): Promise<{ id: string; queueNumber: number }> {
    const res = await this.ctx.post(`/api/queues/${queueId}/entries`, { headers: { 'X-CSRF-Token': this.csrf } });
    expect(res.status(), 'join').toBe(201);
    return (await res.json()).data.entry;
  }

  async post(pathname: string): Promise<number> {
    const res = await this.ctx.post(pathname, { headers: { 'X-CSRF-Token': this.csrf } });
    return res.status();
  }

  async callNext(queueId = OPEN_QUEUE_ID): Promise<{ id: string; queueNumber: number } | null> {
    const res = await this.ctx.post(`/api/operator/queues/${queueId}/call-next`, { headers: { 'X-CSRF-Token': this.csrf } });
    if (res.status() === 204) return null;
    expect(res.status(), 'call-next').toBe(200);
    return (await res.json()).data.entry;
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}

export interface LayoutReport {
  scrollWidth: number;
  clientWidth: number;
  innerWidth: number;
  offenders: string[];
}

/**
 * UI-001 checks: no page-level horizontal overflow, and no visible element whose box crosses the
 * viewport edge. The second check matters because the layouts use `overflow-x-hidden`, which would
 * hide overflow from `scrollWidth` alone.
 */
export async function measureLayout(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.closest('.sr-only')) continue; // visually-hidden text is clipped on purpose
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < -0.5 || r.right > vw + 0.5) {
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
        offenders.push(`<${el.tagName.toLowerCase()}> "${label}" left=${Math.round(r.left)} right=${Math.round(r.right)}`);
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: vw,
      offenders,
    };
  });
}

export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<LayoutReport> {
  const report = await measureLayout(page);
  expect(report.scrollWidth, `${label}: scrollWidth <= clientWidth`).toBeLessThanOrEqual(report.clientWidth);
  expect(report.scrollWidth, `${label}: scrollWidth <= innerWidth`).toBeLessThanOrEqual(report.innerWidth);
  expect(report.offenders, `${label}: elements crossing the viewport edge`).toEqual([]);
  return report;
}
