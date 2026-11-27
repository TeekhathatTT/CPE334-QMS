/**
 * F-09 Multi-counter support: pure domain policy helpers (BR-18, BR-19, Feature SDS §5 & §11).
 * No database or Express dependency so COUNTER-001 tests them directly as unit rules.
 */
export const COUNTER_STATUSES = ['OPEN', 'CLOSED'] as const;
export type CounterStatusValue = (typeof COUNTER_STATUSES)[number];

/** BR-19: counter-scoped Call Next is permitted only when the counter is OPEN. */
export function canCallNextOnCounter(status: string): boolean {
  return status === 'OPEN';
}

/** BR-18: only the exact enum strings 'OPEN' and 'CLOSED' are valid counter statuses. */
export function isCounterStatusValid(value: unknown): value is CounterStatusValue {
  return value === 'OPEN' || value === 'CLOSED';
}

/**
 * BR-18 / D-7: operator must be assigned to the counter's ServiceQueue; when `assignedOperatorId`
 * is non-null, only that specific operator may toggle status or call next at the counter.
 */
export function canOperatorUseCounter(
  isQueueAssigned: boolean,
  assignedOperatorId: string | null,
  operatorId: string
): boolean {
  if (!isQueueAssigned) return false;
  return assignedOperatorId === null || assignedOperatorId === operatorId;
}
