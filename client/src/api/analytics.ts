/** F-11 operator analytics endpoint (Sprint 3 api-spec §2.1). */
import { ApiError, apiRequest } from './client';

export interface DurationStats {
  count: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
  p90Seconds: number | null;
  maxSeconds: number | null;
}

export interface DailyAnalytics {
  date: string;
  joined: number;
  completed: number;
  cancelled: number;
  noShow: number;
  averageWaitSeconds: number | null;
  averageServiceSeconds: number | null;
}

export interface QueueAnalytics {
  queueId: string;
  queueName: string;
  from: string;
  to: string;
  timezone: string;
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
  daily: DailyAnalytics[];
}

/** `GET /api/operator/queues/{queueId}/analytics?from&to` (dates `YYYY-MM-DD`, Asia/Bangkok). */
export async function getQueueAnalytics(queueId: string, from: string, to: string): Promise<QueueAnalytics> {
  const data = await apiRequest<{ analytics: QueueAnalytics }>(
    `/api/operator/queues/${encodeURIComponent(queueId)}/analytics?from=${from}&to=${to}`
  );
  if (!data?.analytics) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Unexpected response.');
  }
  return data.analytics;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's calendar date in Asia/Bangkok, shifted by `offsetDays`. */
export function bangkokDateOffset(offsetDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive number of days between two `YYYY-MM-DD` dates. */
export function inclusiveDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** `4m 05s`, `1h 02m 03s`, or `—` for `null` (ui-spec §2.2). */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${ss}s`;
  return `${m}m ${ss}s`;
}
