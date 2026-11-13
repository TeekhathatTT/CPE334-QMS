/**
 * Operator queue management endpoints (api-spec §8.1–§8.5). Every call goes through `apiRequest`,
 * which attaches `X-CSRF-Token` on mutations and reports `401 UNAUTHORIZED` to the global
 * session-expired handler.
 */
import { ApiError, apiRequest } from './client';
import type { QueueEntry, QueueSummary } from './queues';

function required<T>(value: T | undefined): T {
  if (value === undefined || value === null) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Unexpected response.');
  }
  return value;
}

/** `GET /api/operator/queues` — queues assigned to the signed-in operator (api-spec §8.1). */
export async function listAssignedQueues(): Promise<QueueSummary[]> {
  const data = await apiRequest<{ queues: QueueSummary[] }>('/api/operator/queues');
  return required(data?.queues);
}

/** `GET /api/operator/queues/{queueId}/entries` — entries in FIFO order (api-spec §8.2). */
export async function listOperatorQueueEntries(queueId: string): Promise<QueueEntry[]> {
  const data = await apiRequest<{ entries: QueueEntry[] }>(
    `/api/operator/queues/${encodeURIComponent(queueId)}/entries`
  );
  return required(data?.entries);
}

/**
 * `POST /api/operator/queues/{queueId}/call-next` (api-spec §8.3).
 * Returns the called `QueueEntry` on `200 OK`, or `null` when the queue has no eligible
 * `WAITING` entry (`204 No Content`).
 */
export async function callNextQueueEntry(queueId: string): Promise<QueueEntry | null> {
  const data = await apiRequest<{ entry: QueueEntry }>(
    `/api/operator/queues/${encodeURIComponent(queueId)}/call-next`,
    { method: 'POST' }
  );
  if (data === undefined) {
    return null;
  }
  return required(data.entry);
}

/** `POST /api/operator/queue-entries/{entryId}/start` — CALLED -> SERVING (api-spec §8.4). */
export async function startQueueEntry(entryId: string): Promise<QueueEntry> {
  const data = await apiRequest<{ entry: QueueEntry }>(
    `/api/operator/queue-entries/${encodeURIComponent(entryId)}/start`,
    { method: 'POST' }
  );
  return required(data?.entry);
}

/** `POST /api/operator/queue-entries/{entryId}/complete` — SERVING -> COMPLETED (api-spec §8.5). */
export async function completeQueueEntry(entryId: string): Promise<QueueEntry> {
  const data = await apiRequest<{ entry: QueueEntry }>(
    `/api/operator/queue-entries/${encodeURIComponent(entryId)}/complete`,
    { method: 'POST' }
  );
  return required(data?.entry);
}

