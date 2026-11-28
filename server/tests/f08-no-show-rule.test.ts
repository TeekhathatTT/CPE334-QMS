/**
 * F-08 NOSHOW-001 (unit, no database): BR-15 no-show rule and BR-16 recovery rule.
 * docs/sprints/sprint-2/tests.md §7.1
 */
import { describe, it, expect } from 'vitest';
import { MAX_NO_SHOWS, canMarkNoShow, recoveryDecision } from '../src/services/noShowPolicy';

const STATUSES = ['WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

describe('F-08 NOSHOW-001: only a CALLED entry can be marked no-show (BR-15)', () => {
  it('CALLED can be marked no-show', () => {
    expect(canMarkNoShow('CALLED')).toBe(true);
  });

  it.each(STATUSES.filter((s) => s !== 'CALLED').concat('SOMETHING_ELSE'))('%s cannot be marked no-show', (status) => {
    expect(canMarkNoShow(status)).toBe(false);
  });
});

describe('F-08 NOSHOW-001: a NO_SHOW entry can be returned once (BR-16)', () => {
  it('the limit is two no-shows, i.e. one return', () => {
    expect(MAX_NO_SHOWS).toBe(2);
  });

  it('NO_SHOW with noShowCount 1 may be returned', () => {
    expect(recoveryDecision({ status: 'NO_SHOW', noShowCount: 1 })).toBe('ok');
  });

  it('NO_SHOW with noShowCount 2 has reached the limit', () => {
    expect(recoveryDecision({ status: 'NO_SHOW', noShowCount: 2 })).toBe('limit');
  });

  it.each(STATUSES.filter((s) => s !== 'NO_SHOW').flatMap((status) => [0, 1, 2].map((noShowCount) => [status, noShowCount] as const)))(
    '%s with noShowCount %i is an invalid state for a return',
    (status, noShowCount) => {
      expect(recoveryDecision({ status, noShowCount })).toBe('invalid_state');
    }
  );
});
