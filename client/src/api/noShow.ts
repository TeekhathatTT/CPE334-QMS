import type { QueueEntry } from './queues';

/**
 * F-08 (SRS BR-16, Sprint 2 api-spec §7.1): an entry may be returned to the queue once, so a
 * `NO_SHOW` entry with `noShowCount` 2 is final. The server enforces the rule; the UI uses the
 * same number only to decide which control or message to show.
 */
export const MAX_NO_SHOWS = 2;

/** A `NO_SHOW` entry the operator may still return to the queue. */
export function canReturnToQueue(entry: QueueEntry): boolean {
  return entry.status === 'NO_SHOW' && (entry.noShowCount ?? 0) < MAX_NO_SHOWS;
}

/** A `NO_SHOW` entry that can no longer be returned; it no longer changes. */
export function isFinalNoShow(entry: QueueEntry): boolean {
  return entry.status === 'NO_SHOW' && (entry.noShowCount ?? 0) >= MAX_NO_SHOWS;
}
