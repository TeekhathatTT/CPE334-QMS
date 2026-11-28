/**
 * F-10 PRIO-001 (unit, no database): priority enum validation, mutability rule, rank,
 * and deterministic priority-aware FIFO comparator (BR-01 rev. 5.0, BR-21, BR-22, BR-23).
 * Canonical STS: docs/sprints/sprint-2/tests.md §9.1.
 */
import { describe, it, expect } from 'vitest';
import {
  isPriorityValid,
  canUpdateEntryPriority,
  priorityRank,
  compareWaitingEntries,
} from '../src/services/priorityPolicy';

describe('F-10 PRIO-001: QueuePriority validation (BR-21)', () => {
  it.each(['NORMAL', 'PRIORITY'])('%s is a valid QueuePriority', (value) => {
    expect(isPriorityValid(value)).toBe(true);
  });

  it.each(['normal', 'priority', 'HIGH', 'URGENT', 'VIP', '', null, undefined, 123, {}])(
    '%j is rejected as an invalid QueuePriority',
    (value) => {
      expect(isPriorityValid(value)).toBe(false);
    }
  );
});

describe('F-10 PRIO-001: priority mutability status rule (BR-22)', () => {
  it('allows priority updates only when status is WAITING', () => {
    expect(canUpdateEntryPriority('WAITING')).toBe(true);
  });

  it.each(['CALLED', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW', '', 'waiting'])(
    'rejects priority updates when status is %j',
    (status) => {
      expect(canUpdateEntryPriority(status)).toBe(false);
    }
  );
});

describe('F-10 PRIO-001: priority rank and priority-aware FIFO tie-breaking (BR-01 rev. 5.0, BR-23)', () => {
  it('ranks PRIORITY strictly ahead of NORMAL independent of lexical/enum order', () => {
    expect(priorityRank('PRIORITY')).toBe(0);
    expect(priorityRank('NORMAL')).toBe(1);
    expect(priorityRank('PRIORITY')).toBeLessThan(priorityRank('NORMAL'));
  });

  it('orders PRIORITY before NORMAL even when PRIORITY joined later, and breaks ties by joinedAt ASC then id ASC', () => {
    const t0 = new Date('2026-11-28T09:00:00.000Z');
    const t1 = new Date('2026-11-28T09:01:00.000Z');
    const t2 = new Date('2026-11-28T09:02:00.000Z');

    const n1 = { id: '11111111-1111-4111-8111-111111111111', priority: 'NORMAL' as const, joinedAt: t0 };
    const n2 = { id: '22222222-2222-4222-8222-222222222222', priority: 'NORMAL' as const, joinedAt: t1 };
    const p2 = { id: '44444444-4444-4444-8444-444444444444', priority: 'PRIORITY' as const, joinedAt: t2 };
    const p1 = { id: '33333333-3333-4333-8333-333333333333', priority: 'PRIORITY' as const, joinedAt: t2 };

    const sorted = [n2, p2, n1, p1].sort(compareWaitingEntries);
    expect(sorted.map((e) => e.id)).toEqual([p1.id, p2.id, n1.id, n2.id]);
  });

  it('matches pure Sprint 1 FIFO when all entries have NORMAL priority', () => {
    const t0 = new Date('2026-11-28T09:00:00.000Z');
    const t1 = new Date('2026-11-28T09:05:00.000Z');

    const a = { id: '11111111-aaaa-4111-8111-111111111111', priority: 'NORMAL' as const, joinedAt: t0 };
    const b = { id: '22222222-bbbb-4222-8222-222222222222', priority: 'NORMAL' as const, joinedAt: t0 };
    const c = { id: '33333333-cccc-4333-8333-333333333333', priority: 'NORMAL' as const, joinedAt: t1 };

    const sorted = [c, b, a].sort(compareWaitingEntries);
    expect(sorted.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
  });
});
