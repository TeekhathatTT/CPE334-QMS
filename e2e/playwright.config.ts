/**
 * Issue #7 browser E2E. Run with `npm run test:e2e` from the repository root.
 *
 * - Starts the API (compiled, NODE_ENV=test, isolated TEST_DATABASE_URL) on :3000 and the Vite
 *   client on :5173. The browser only talks to :5173; /api goes through the Vite proxy, so cookies
 *   and CSRF behave as in normal use. CORS stays off.
 * - Never reuses an already-running server: a dev server on :3000 would point at the dev database.
 * - Serial, one worker, no retries (a retry would hide a flaky test).
 */
import path from 'path';
import { defineConfig, devices } from '@playwright/test';
import { loadE2eEnv, SERVER_DIR, ROOT_DIR } from './helpers/env';

// Throws (and the run stops) before any server starts if the target is not a test database.
const env = loadE2eEnv();

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, 'test-results', 'results.json') }],
    ['html', { outputFolder: path.join(__dirname, 'playwright-report'), open: 'never' }],
    ['./helpers/summary-reporter.ts'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  // `npm run test:e2e` runs chromium only; `npm run test:e2e:all-browsers` runs all three.
  // Evidence screenshots are written by the chromium project only (helpers/app.ts `shot`).
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      name: 'api',
      command: 'npm run build && node dist/server.js',
      cwd: SERVER_DIR,
      url: 'http://localhost:3000/api/auth/me', // 401 when ready; Playwright accepts 401 as "up"
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        TEST_DATABASE_URL: env.TEST_DATABASE_URL,
        DATABASE_URL: env.DATABASE_URL,
        SESSION_SECRET: env.SESSION_SECRET,
        CORS_ORIGIN: '',
      },
    },
    {
      name: 'client',
      command: 'npm run dev --workspace=client -- --port 5173 --strictPort',
      cwd: ROOT_DIR,
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
