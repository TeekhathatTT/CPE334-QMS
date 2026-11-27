/**
 * F-08 no-show and recovery rules (BR-15, BR-16; feature SDS D-1, D-4).
 * TDD red stub: the real rules are added in the implementation commit.
 */

/** BR-16: an entry may be returned to the queue once, so `noShowCount` 2 is final. */
export const MAX_NO_SHOWS = 2;

export type RecoveryDecision = 'ok' | 'invalid_state' | 'limit';

/** BR-15: only a `CALLED` entry may be marked `NO_SHOW`. */
export function canMarkNoShow(_status: string): boolean {
  throw new Error('Not implemented');
}

/** BR-16: `ok` only for `NO_SHOW` with `noShowCount` 1; `limit` for `NO_SHOW` at the limit. */
export function recoveryDecision(_entry: { status: string; noShowCount: number }): RecoveryDecision {
  throw new Error('Not implemented');
}
