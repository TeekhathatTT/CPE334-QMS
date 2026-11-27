/**
 * F-08 no-show and recovery rules (BR-15, BR-16; feature SDS D-1, D-4).
 * Pure functions so the rules are unit-tested without a database (NOSHOW-001).
 */

/** BR-16: an entry may be returned to the queue once, so `noShowCount` 2 is final. */
export const MAX_NO_SHOWS = 2;

export type RecoveryDecision = 'ok' | 'invalid_state' | 'limit';

/** BR-15: only a `CALLED` entry may be marked `NO_SHOW`. */
export function canMarkNoShow(status: string): boolean {
  return status === 'CALLED';
}

/** BR-16: `ok` only for `NO_SHOW` with `noShowCount` 1; `limit` for `NO_SHOW` at the limit. */
export function recoveryDecision(entry: { status: string; noShowCount: number }): RecoveryDecision {
  if (entry.status !== 'NO_SHOW') return 'invalid_state';
  if (entry.noShowCount >= MAX_NO_SHOWS) return 'limit';
  if (entry.noShowCount < 1) return 'invalid_state';
  return 'ok';
}
