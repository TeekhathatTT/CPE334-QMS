import { describe, it, expect } from 'vitest';

// C-02 DEMONSTRATION ONLY (Lab 5 Ep.6, Issue #20, R-06).
// This test fails on purpose so the required CI check fails and GitHub blocks the merge.
// It lives only on the temporary branch tmp/lab5-c02-failing-check; that Pull Request is
// closed without merging. Never merge this file.
describe('C-02 merge gate demonstration', () => {
  it('fails on purpose to prove a failing required check blocks the merge', () => {
    expect(1 + 1).toBe(3);
  });
});
