/**
 * F-11 Operational analytics: pure domain rules with no database dependency
 * (SRS v6.0 BR-24 – BR-26; feature SDS docs/features/sprint-3-f11-operational-analytics.md D-1 – D-5).
 * Unit-tested by ANALYTICS-001.
 */
import { AppError } from '../errors/AppError';

/** Asia/Bangkok is UTC+07:00 all year (no daylight saving time). */
export const ANALYTICS_TIMEZONE = 'Asia/Bangkok';
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 31;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface AnalyticsRange {
  fromUtc: Date;
  toUtcExclusive: Date;
  days: string[];
}

export interface DurationStats {
  count: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
  p90Seconds: number | null;
  maxSeconds: number | null;
}

export interface CohortRow {
  status: string;
  priority: string;
  joinedAt: Date;
  calledAt: Date | null;
  serviceStartedAt: Date | null;
  completedAt: Date | null;
  recoveredAt: Date | null;
}

export interface DailyRow {
  date: string;
  joined: number;
  completed: number;
  cancelled: number;
  noShow: number;
  averageWaitSeconds: number | null;
  averageServiceSeconds: number | null;
}

export interface CohortSummary {
  volumes: {
    joined: number;
    waiting: number;
    called: number;
    serving: number;
    completed: number;
    cancelled: number;
    noShow: number;
    recovered: number;
    priority: number;
  };
  waitTime: DurationStats;
  serviceTime: DurationStats;
  daily: DailyRow[];
}

function invalid(message: string): AppError {
  return new AppError(400, 'INVALID_ARGUMENT', message);
}

/** Half-up rounding to 1 decimal place (D-3). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Calendar date (`YYYY-MM-DD`) of an instant in Asia/Bangkok. */
export function bangkokDate(instant: Date): string {
  return new Date(instant.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 Asia/Bangkok on a validated calendar date. */
function bangkokMidnightUtc(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - BANGKOK_OFFSET_MS);
}

function parseDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw invalid(`${name} must be a date in YYYY-MM-DD format.`);
  }
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw invalid(`${name} is not a valid calendar date.`);
  }
  return value;
}

/**
 * BR-26: `from` and `to` are inclusive Asia/Bangkok dates, `from <= to`, span <= 31 days.
 * Returns the half-open UTC interval [fromUtc, toUtcExclusive) and every calendar date in the range.
 */
export function parseAnalyticsRange(from: unknown, to: unknown, maxDays = MAX_RANGE_DAYS): AnalyticsRange {
  const fromDate = parseDate(from, 'from');
  const toDate = parseDate(to, 'to');
  const fromUtc = bangkokMidnightUtc(fromDate);
  const toStart = bangkokMidnightUtc(toDate);
  if (toStart.getTime() < fromUtc.getTime()) {
    throw invalid('from must be on or before to.');
  }
  const spanDays = Math.round((toStart.getTime() - fromUtc.getTime()) / DAY_MS) + 1;
  if (spanDays > maxDays) {
    throw invalid(`The range must be ${maxDays} days or fewer.`);
  }
  const days: string[] = [];
  for (let i = 0; i < spanDays; i++) {
    days.push(new Date(Date.parse(`${fromDate}T00:00:00.000Z`) + i * DAY_MS).toISOString().slice(0, 10));
  }
  return { fromUtc, toUtcExclusive: new Date(toStart.getTime() + DAY_MS), days };
}

/** Linear-interpolation percentile over an ascending list (same definition as PostgreSQL `percentile_cont`). */
function percentile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** BR-25 / D-3 statistics; every value is `null` when there are no samples. */
export function summarizeDurations(seconds: number[]): DurationStats {
  if (seconds.length === 0) {
    return { count: 0, averageSeconds: null, medianSeconds: null, p90Seconds: null, maxSeconds: null };
  }
  const sorted = [...seconds].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, s) => acc + s, 0);
  return {
    count: sorted.length,
    averageSeconds: round1(sum / sorted.length),
    medianSeconds: round1(percentile(sorted, 0.5)),
    p90Seconds: round1(percentile(sorted, 0.9)),
    maxSeconds: round1(sorted[sorted.length - 1]),
  };
}

const seconds = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 1000;

function waitSeconds(row: CohortRow): number | null {
  return row.calledAt ? seconds(row.joinedAt, row.calledAt) : null;
}

function serviceSeconds(row: CohortRow): number | null {
  return row.status === 'COMPLETED' && row.serviceStartedAt && row.completedAt
    ? seconds(row.serviceStartedAt, row.completedAt)
    : null;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round1(values.reduce((a, b) => a + b, 0) / values.length);
}

/** BR-24 / BR-25: volumes by current status, duration statistics and one row per day in `days`. */
export function summarizeCohort(rows: CohortRow[], days: string[]): CohortSummary {
  const volumes = { joined: 0, waiting: 0, called: 0, serving: 0, completed: 0, cancelled: 0, noShow: 0, recovered: 0, priority: 0 };
  const waits: number[] = [];
  const services: number[] = [];
  const perDay = new Map<string, { rows: CohortRow[] }>(days.map((d) => [d, { rows: [] }]));

  for (const row of rows) {
    volumes.joined += 1;
    switch (row.status) {
      case 'WAITING': volumes.waiting += 1; break;
      case 'CALLED': volumes.called += 1; break;
      case 'SERVING': volumes.serving += 1; break;
      case 'COMPLETED': volumes.completed += 1; break;
      case 'CANCELLED': volumes.cancelled += 1; break;
      case 'NO_SHOW': volumes.noShow += 1; break;
      default: break;
    }
    if (row.recoveredAt) volumes.recovered += 1;
    if (row.priority === 'PRIORITY') volumes.priority += 1;
    const w = waitSeconds(row);
    if (w !== null) waits.push(w);
    const s = serviceSeconds(row);
    if (s !== null) services.push(s);
    perDay.get(bangkokDate(row.joinedAt))?.rows.push(row);
  }

  const daily: DailyRow[] = days.map((date) => {
    const dayRows = perDay.get(date)?.rows ?? [];
    return {
      date,
      joined: dayRows.length,
      completed: dayRows.filter((r) => r.status === 'COMPLETED').length,
      cancelled: dayRows.filter((r) => r.status === 'CANCELLED').length,
      noShow: dayRows.filter((r) => r.status === 'NO_SHOW').length,
      averageWaitSeconds: average(dayRows.map(waitSeconds).filter((v): v is number => v !== null)),
      averageServiceSeconds: average(dayRows.map(serviceSeconds).filter((v): v is number => v !== null)),
    };
  });

  return { volumes, waitTime: summarizeDurations(waits), serviceTime: summarizeDurations(services), daily };
}
