/**
 * F-07 CANCEL-001 (unit, no database): BR-13 cancellable-state rule.
 * docs/sprints/sprint-2/tests.md
 */
import { describe, it, expect } from 'vitest';
import { isCustomerCancellable } from '../src/services/cancellationPolicy';

describe('F-07 CANCEL-001: a customer may cancel only a WAITING entry (BR-13)', () => {
  it('WAITING is cancellable', () => {
    expect(isCustomerCancellable('WAITING')).toBe(true);
  });

  it.each(['CALLED', 'SERVING', 'COMPLETED', 'CANCELLED'])('%s is not cancellable', (status) => {
    expect(isCustomerCancellable(status)).toBe(false);
  });

  it('an unknown status is not cancellable', () => {
    expect(isCustomerCancellable('SOMETHING_ELSE')).toBe(false);
  });
});
