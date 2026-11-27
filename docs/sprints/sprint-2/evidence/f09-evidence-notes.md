# F-09 Evidence Notes for the Deliverable 2 PDF

| Item | Value |
|---|---|
| Issue | #42 F-09 Multi-counter support (author @Khwanklao, reviewer @TeekhathatTT) |
| Contract | v1 `016616e`, v1.1 `e185b6a` (PR #61, reviewed: changes requested, then approved); v1.2/v1.3 alignment in PR #62 |
| TDD red commit | `3a63260`. Re-executed red run: server 202 passed / 12 failed plus 1 file that cannot load (`counterPolicy` missing); client 107 passed / 13 failed. These are the same counts as the original run recorded in [tests.md §8.5](../tests.md) |
| Implementation commits | `3a4f439` (schema, migration, services, routes, UI), `4914dfa` (docs and evidence), `adc567d` (PR review fixes) |
| Merged to `sprint2-staging` | `bae2d3d` (PR #62, approved, CI green) |
| Green run | at `bae2d3d`: server 18 files / 236 tests, client 8 files / 125 tests, E2E Chromium 22/22, server typecheck ok |
| Raw output | [f09-red-run.txt](./f09-red-run.txt), [f09-green-run.txt](./f09-green-run.txt), [perf-s2-003.txt](./perf-s2-003.txt) |
| Tested version | local build of `bae2d3d`. The footer shows "Release v1.1", which is the version string of the base release; F-09 is not yet released to `main` or deployed |

About the raw run files: the original red and green runs (2026-11-27) recorded only counts in tests.md §8.5. To provide the raw output that the F-09 DoD names, the red run was re-executed at `3a63260` and the green run at `bae2d3d` on the same date. Each file header states this. The local test database already had the F-09 migration during the red re-run; the red commit's code does not use it.

## Excerpt 1: concurrency, no double-claim across counters (COUNTER-010, AC-40)

`server/tests/f09-multi-counter.test.ts`: for 15 rounds, with 2 `WAITING` entries, Call Next on Counter 1 and Counter 2 is sent in parallel. Both calls succeed and claim two different entries, each recording its own counter. With 1 `WAITING` entry (another 15 rounds), exactly one call gets `200` and the other gets `409 NO_WAITING_ENTRIES`.

```ts
const [r1, r2] = await Promise.all([
  counterCallNext(operator1, COUNTER_Q1_1),
  counterCallNext(operator1, COUNTER_Q1_2),
]);
expect([r1.status, r2.status]).toEqual([200, 200]);
expect(new Set([id1, id2])).toEqual(new Set([a.id, b.id]));
expect((await entryRow(id1))?.counterId).toBe(COUNTER_Q1_1);
expect((await entryRow(id2))?.counterId).toBe(COUNTER_Q1_2);
```

Result: failed at red `3a63260` (route missing). Passed at `bae2d3d` (`f09-green-run.txt`).

## Excerpt 2: access restriction at the API (COUNTER-004, COUNTER-005, AC-37)

The list, status and Call Next endpoints reject each caller and leave the counter and entry rows unchanged:

| Caller | Result |
|---|---|
| no session | `401` |
| customer | `403` |
| operator not assigned to the queue | `403` |
| operator1 on a counter whose `assignedOperatorId` is another operator | `403` |
| missing or wrong CSRF | `403` |
| malformed id | `400` |
| unknown id | `404` |

Result: passed at `bae2d3d`.

## Screenshots created by the E2E run (manual-equivalent UI flow automated in Playwright, Chromium, commit `bae2d3d`, local test database, 2026-11-27)

| File | AC | Role | Preconditions | Steps | Expected | Actual |
|---|---|---|---|---|---|---|
| `f09-01-operator-two-counters-active.png` | AC-38, AC-42 | OPERATOR (operator1) | DB reset; customer1 (#1) and customer2 (#2) joined General Inquiry Desk; Counter 1 and Counter 2 `OPEN` | Call Next on Counter 1, then on Counter 2 | Counters panel shows both counters `Open`; #1 `Called` with a "Counter 1" badge, #2 with "Counter 2"; banner "Called queue number 2 to Counter 2."; DB `counterId` set to each counter | as expected (COUNTER-016 passed) |
| `f09-02-customer-called-counter1.png` | AC-43 | CUSTOMER (customer1) | #1 called at Counter 1; Counter 2 then closed and #2 completed by the operator | customer1 opens `/customer/entries/:id` | status `Called`, "Counter 1" badge, message "Please proceed to Counter 1."; same after reload | as expected (COUNTER-016) |
| `f09-03-operator-360.png`, `f09-03-operator-1280.png` | AC-42 | OPERATOR | customer1 joined; operator used only the keyboard to close Counter 2, open it again, and Call Next on Counter 1 | page reloaded at 360 × 800 and 1280 × 800 | Counters panel readable, no horizontal overflow, Active: 1 | as expected (COUNTER-018) |
| `f09-04-customer-360.png`, `f09-04-customer-1280.png` | AC-43 | CUSTOMER | customer1 called at Counter 1 | entry page at 360 × 800 and 1280 × 800 | "Please proceed to Counter 1." with the badge, no horizontal overflow | as expected (COUNTER-018) |

Negative and recovery UI paths are asserted in E2E without a screenshot:
- COUNTER-017: `409 NO_WAITING_ENTRIES` and `409 COUNTER_CLOSED` alerts; a NO_SHOW entry that is returned and re-called at Counter 2 shows "Please proceed to Counter 2."
- COUNTER-019: the zero-usable-counter fallback, with the 204 message "No waiting entries to call right now." and the Sprint 1 prompt "Please go to the service desk."

Not shown here: Firefox/WebKit E2E. Cloud SQL migration, counter provisioning and the Cloud Run deployment happen at the Sprint 2 release.
