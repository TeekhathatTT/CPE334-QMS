/**
 * Customer queue endpoints (api-spec §7.1–§7.4). Every call goes through `apiRequest`, which adds
 * `X-CSRF-Token` to mutations and reports `401 UNAUTHORIZED` to the global session-expired handler.
 */
import { ApiError, apiRequest } from './client';

export type QueueAvailability = 'OPEN' | 'CLOSED';
export type QueueEntryStatus = 'WAITING' | 'CALLED' | 'SERVING' | 'COMPLETED';

/** api-spec §3.2 */
export interface QueueSummary {
  id: string;
  name: string;
  description: string | null;
  availability: QueueAvailability;
}

/** api-spec §3.3. `aheadCount` is present only on `GET /api/me/queue-entries/{entryId}`. */
export interface QueueEntry {
  id: string;
  serviceQueueId: string;
  customerId: string;
  queueNumber: number;
  status: QueueEntryStatus;
  joinedAt: string;
  calledAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  aheadCount?: number;
}

function required<T>(value: T | undefined): T {
  if (value === undefined || value === null) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Unexpected response.');
  }
  return value;
}

/** `GET /api/queues` — OPEN queues only. */
export async function listQueues(): Promise<QueueSummary[]> {
  const data = await apiRequest<{ queues: QueueSummary[] }>('/api/queues');
  return required(data?.queues);
}

/** `POST /api/queues/{queueId}/entries` — no body; CSRF header added by `apiRequest`. */
export async function joinQueue(queueId: string): Promise<QueueEntry> {
  const data = await apiRequest<{ entry: QueueEntry }>(`/api/queues/${encodeURIComponent(queueId)}/entries`, {
    method: 'POST',
  });
  return required(data?.entry);
}

/** `GET /api/me/queue-entries` — the signed-in customer's entries, newest first. */
export async function listMyEntries(): Promise<QueueEntry[]> {
  const data = await apiRequest<{ entries: QueueEntry[] }>('/api/me/queue-entries');
  return required(data?.entries);
}

/** `GET /api/me/queue-entries/{entryId}` — one own entry including `aheadCount`. */
export async function getMyEntry(entryId: string): Promise<QueueEntry> {
  const data = await apiRequest<{ entry: QueueEntry }>(`/api/me/queue-entries/${encodeURIComponent(entryId)}`);
  return required(data?.entry);
}

/** True for the `401 UNAUTHORIZED` that the global handler already turned into a redirect to /login. */
export function isSessionExpiredError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** Fallback when an entry's queue is not in the OPEN-queue list (Issue #5 decision 1). */
export const UNKNOWN_QUEUE_NAME = 'Service queue';

export function queueNameFor(queues: QueueSummary[] | undefined, serviceQueueId: string): string {
  return queues?.find((queue) => queue.id === serviceQueueId)?.name ?? UNKNOWN_QUEUE_NAME;
}
