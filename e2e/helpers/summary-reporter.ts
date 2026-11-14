/**
 * Writes a counts-only summary of each E2E run to docs/sprints/sprint-1/evidence/e2e-run.txt.
 * No request/response data, cookies, or environment values are written.
 * Set E2E_SUMMARY_APPEND=1 to append the run instead of replacing the file.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'sprints', 'sprint-1', 'evidence', 'e2e-run.txt');

export default class SummaryReporter implements Reporter {
  private rows: string[] = [];
  private counts = { passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0, flaky: 0 };
  private started = new Date();
  private version = '';
  private workers = 0;
  private total = 0;

  onBegin(config: FullConfig, suite: Suite): void {
    this.started = new Date();
    this.version = config.version;
    this.workers = config.workers;
    this.total = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.retry < test.retries && result.status !== 'passed' && result.status !== 'skipped') return;
    const outcome = test.outcome();
    if (outcome === 'flaky') this.counts.flaky++;
    else this.counts[result.status]++;
    const file = path.basename(test.location.file);
    const title = test.titlePath().slice(3).join(' › ');
    this.rows.push(`${result.status.toUpperCase().padEnd(8)} ${file} › ${title} (${(result.duration / 1000).toFixed(1)}s)`);
  }

  onEnd(result: FullResult): void {
    const lines = [
      `E2E run: ${this.started.toISOString()}`,
      `Command: npm run test:e2e   (playwright test --config e2e/playwright.config.ts)`,
      `Playwright ${this.version}, Chromium (headless), workers=${this.workers}, retries=0`,
      `Host: ${os.type()} ${os.release()}, Node ${process.version}`,
      `Overall: ${result.status.toUpperCase()} in ${(result.duration / 1000).toFixed(1)}s`,
      `Tests: ${this.total} total, ${this.counts.passed} passed, ${this.counts.failed + this.counts.timedOut} failed, ` +
        `${this.counts.skipped} skipped, ${this.counts.flaky} flaky, ${this.counts.interrupted} interrupted`,
      '',
      ...this.rows,
      '',
      '',
    ];
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    if (process.env.E2E_SUMMARY_APPEND === '1') fs.appendFileSync(OUT, lines.join('\n'));
    else fs.writeFileSync(OUT, lines.join('\n'));
  }

  printsToStdio(): boolean {
    return false;
  }
}
