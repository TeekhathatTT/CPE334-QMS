/**
 * F-10 Priority queue policy domain rules (SRS v5.1 BR-01 rev. 5.0, BR-21, BR-22, BR-23).
 * Pure helpers with no database dependency so they are directly unit-testable (PRIO-001).
 */

export const QUEUE_PRIORITIES = ['NORMAL', 'PRIORITY'] as const;
export type QueuePriorityValue = (typeof QUEUE_PRIORITIES)[number];

/** BR-21: only exact enum values NORMAL and PRIORITY are valid. */
export function isPriorityValid(value: unknown): value is QueuePriorityValue {
  return value === 'NORMAL' || value === 'PRIORITY';
}

/** BR-22: operator may change an entry's priority only while its status is WAITING. */
export function canUpdateEntryPriority(status: unknown): boolean {
  return status === 'WAITING';
}

/**
 * BR-01 (rev. 5.0) / BR-23: explicit sort rank independent of PostgreSQL enum declaration
 * or alphabetical order. PRIORITY (0) always precedes NORMAL (1).
 */
export function priorityRank(priority: QueuePriorityValue): number {
  return priority === 'PRIORITY' ? 0 : 1;
}

export interface WaitingSortableEntry {
  id: string;
  priority: QueuePriorityValue;
  joinedAt: Date;
}

/**
 * Deterministic priority-aware FIFO comparator for WAITING entries:
 * 1. priorityRank(priority) ASC  (PRIORITY before NORMAL)
 * 2. joinedAt ASC
 * 3. id ASC (UUID lexical tie-breaker)
 */
export function compareWaitingEntries(a: WaitingSortableEntry, b: WaitingSortableEntry): number {
  const rankDiff = priorityRank(a.priority) - priorityRank(b.priority);
  if (rankDiff !== 0) return rankDiff;

  const timeDiff = a.joinedAt.getTime() - b.joinedAt.getTime();
  if (timeDiff !== 0) return timeDiff;

  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
