/**
 * F-09 COUNTER-001 (unit, no database): counter status validation and operator-scope policy rules (BR-18, BR-19).
 * Contract: docs/sprints/sprint-2/tests.md §8.1, docs/features/sprint-2-f09-multi-counter.md §5 & §11.
 */
import { describe, it, expect } from 'vitest';
import {
  canCallNextOnCounter,
  isCounterStatusValid,
  canOperatorUseCounter,
} from '../src/services/counterPolicy';

const OPERATOR_A = '33333333-3333-4333-8333-333333333333';
const OPERATOR_B = '44444444-4444-4444-8444-444444444444';

describe('F-09 COUNTER-001: counter Call Next status policy (BR-19)', () => {
  it('OPEN counter allows counter-scoped Call Next', () => {
    expect(canCallNextOnCounter('OPEN')).toBe(true);
  });

  it.each(['CLOSED', 'PAUSED', '', 'open', 'WAITING'])('%s counter rejects counter-scoped Call Next', (status) => {
    expect(canCallNextOnCounter(status)).toBe(false);
  });
});

describe('F-09 COUNTER-001: counter status enum validation (BR-18)', () => {
  it.each(['OPEN', 'CLOSED'])('%s is a valid CounterStatus', (status) => {
    expect(isCounterStatusValid(status)).toBe(true);
  });

  it.each(['open', 'closed', 'PAUSED', 'ACTIVE', '', null, undefined, 123, {}])(
    '%j is rejected as an invalid CounterStatus',
    (value) => {
      expect(isCounterStatusValid(value)).toBe(false);
    }
  );
});

describe('F-09 COUNTER-001: operator counter-scope authorization rule (BR-18, D-7)', () => {
  it('allows an assigned operator when assignedOperatorId is null', () => {
    expect(canOperatorUseCounter(true, null, OPERATOR_A)).toBe(true);
  });

  it('allows an assigned operator when assignedOperatorId matches the caller', () => {
    expect(canOperatorUseCounter(true, OPERATOR_A, OPERATOR_A)).toBe(true);
  });

  it('rejects an assigned operator when assignedOperatorId belongs to a different operator', () => {
    expect(canOperatorUseCounter(true, OPERATOR_B, OPERATOR_A)).toBe(false);
  });

  it('rejects an unassigned operator even when assignedOperatorId is null', () => {
    expect(canOperatorUseCounter(false, null, OPERATOR_A)).toBe(false);
  });

  it('rejects an unassigned operator even when assignedOperatorId matches the caller', () => {
    expect(canOperatorUseCounter(false, OPERATOR_A, OPERATOR_A)).toBe(false);
  });
});
