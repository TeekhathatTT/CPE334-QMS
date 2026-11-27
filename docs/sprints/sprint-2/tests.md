# Sprint 2 Test Specification

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-27 | F-07 contract v1: planned tests CANCEL-001 – CANCEL-020 and REG-S2-001. Nothing has been run yet. |
| 1.1 | 2026-11-27 | Red and green runs executed; status column and §6 updated with actual results. Test definitions unchanged. |
| 1.2 | 2026-11-27 | Adds PERF-S2-001 (NFR-04 for the cancel mutation and the operations F-07 changed) after PR #56 review. §5 first bullet revised (old text kept in §5). CANCEL-001 – CANCEL-020 unchanged. |
| 2.0 | 2026-11-27 | F-08 contract v1 (issue #41): adds §7 with NOSHOW-001 – NOSHOW-020, REG-S2-002 and PERF-S2-002. Nothing in §7 has been run yet. §1–§6 (F-07) unchanged. |
| 2.1 | 2026-11-27 | F-08 red and green runs executed: §7.1 status column and the new §7.5 hold the actual results. F-08 test definitions unchanged, except the NOSHOW-017 position check now uses an exact text match (commit `3714852`, same assertion). |
| 3.0 | 2026-11-27 | F-09 contract v1 (issue #42): adds §8 with COUNTER-001 – COUNTER-018, REG-S2-003 and PERF-S2-003. Nothing in §8 has been run yet. §1–§7 (F-07, F-08) unchanged. |
| 3.1 | 2026-11-27 | F-09 contract v1.1 (PR review fixes): fixes COUNTER-003 setup (`OperatorAssignment(operator1, queue2)`), fixes PERF-S2-003 Step 2 even toggle count + OPEN precondition before Step 3, adds composite FK cross-queue check to COUNTER-013, updates COUNTER-009 (`counterId = NULL`), COUNTER-010(a) (parallel `SKIP LOCKED` wording), COUNTER-014 (other-operator disabled controls + 0-usable-counter fallback + strict badge rule), and COUNTER-015 (`CALLED`/`SERVING`-only badge rule). Nothing in §8 has been run yet. |
| 3.2 | 2026-11-27 | F-09 contract v1.2 alignment: COUNTER-004 expects `404 RESOURCE_NOT_FOUND` for an unknown valid UUIDv4 `queueId` (matching existing `requireQueueAssignment` middleware). |
| 3.3 | 2026-11-27 | F-09 green run executed on `feature/sprint2/42-multi-counter-impl`: §8.1 status column and new §8.5 hold actual results (Server 18/18 files / 236 tests, Client 8/8 files / 120 tests, E2E 21/21 Chromium, PERF-S2-003 5/5 PASS). Notes the Option A selector updates to 6 existing E2E specs for `Counter 1`. |
| 3.4 | 2026-11-27 | F-09 contract v1.3 & final green run (implementation PR review fixes): adds `COUNTER-019` (zero-usable-counter legacy fallback E2E), expands `COUNTER-013` with `ON UPDATE RESTRICT` (`23503` + `pg_constraint`) and `provision:counters` → `seed` idempotency, expands `COUNTER-014` with loading/initial-error/poll-error Retry and `403`/`409` refetch checks (20 F-09 client cases total), and updates §8.5 execution results (Server 18/18 / 236 tests, Client 8/8 / 125 tests, E2E 22/22 Chromium). |
| 3.5 | 2026-11-27 | F-08 follows BR-06 (SRS rev. 4.5): adds NOSHOW-021 – NOSHOW-023 to §7.1 and AC-45 to §7.2. Executed: red `b0ebcb7`, green `4c6c7a7` (§7.5 file table). (Numbered 3.5 because the F-09 implementation PR uses up to 3.4.) |

This document is the plan for verifying F-07. It is not evidence that anything passed. A test counts as passed only after it has been executed and its raw output saved under `docs/sprints/sprint-2/evidence/`. Requirements: [SRS](../../srs.md) v2.0 §10 (AC-17–AC-24). API: [api-spec.md](./api-spec.md). UI: [ui-spec.md](./ui-spec.md). Design: [F-07 feature SDS](../../features/sprint-2-f07-customer-cancellation.md).

## 1. Conventions

- Levels: **Unit** (pure function, no database), **API+DB** (Vitest + supertest against the real PostgreSQL test database `qms_test_db`, same setup as Sprint 1 `server/tests/*.test.ts`), **Client** (Vitest + jsdom + React Testing Library, mocked `fetch`), **E2E** (Playwright, Chromium by default, against the compiled API with `NODE_ENV=test` and the Vite client).
- Accounts: seeded synthetic users `customer1`, `customer2`, `operator1` (assigned to General Inquiry Desk), `operator2` (unassigned). Queues: General Inquiry Desk (`OPEN`), Specialized Consultation (`CLOSED`). The password is the documented development/test seed value; no real secret is used.
- Every API+DB test file calls `resetAndSeed()` first, as Sprint 1 does.
- "Unchanged" means the row's `status`, `calledAt`, `serviceStartedAt`, `completedAt` and `cancelledAt` are equal before and after the request.
- Status column: `planned` until the test has been executed. Then `passed` / `failed` / `skipped` with the commit SHA.

## 2. Test matrix

| ID | Name | Level | Setup | Input | Expected outcome | AC | Planned file | Status |
|---|---|---|---|---|---|---|---|---|
| CANCEL-001 | Cancellable-state rule | Unit | none | `isCustomerCancellable(status)` for each of the five statuses | `true` only for `WAITING`; `false` for `CALLED`, `SERVING`, `COMPLETED`, `CANCELLED` | AC-18 | `server/tests/f07-cancel-rule.test.ts` | **passed** (61e9daf) |
| CANCEL-002 | Owner cancels own WAITING entry | API+DB | customer1 joins General Inquiry Desk (entry E, number N) | `POST /api/me/queue-entries/E/cancel` with session + CSRF | `200`; body `entry.status = CANCELLED`, `cancelledAt` is an RFC 3339 UTC string ending in `Z` and not before `joinedAt`, `aheadCount = 0`, `queueNumber = N`, `calledAt`/`serviceStartedAt`/`completedAt` `null`; DB row re-read on a fresh query has the same status and `cancelledAt`; row count for customer1 unchanged (row not deleted) | AC-17 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-003 | Cancel rejected in every non-WAITING state | API+DB | customer1 entries driven to `CALLED`, `SERVING`, `COMPLETED` (via operator1) and `CANCELLED` (via a first cancel) | cancel each one | each `409 INVALID_STATE_TRANSITION`; each row unchanged | AC-18 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-004 | Non-owner customer gets 404 | API+DB | customer1 `WAITING` entry E | customer2 cancels E | `404 RESOURCE_NOT_FOUND`; body equal (except `requestId`) to the body for an unknown UUID; E unchanged (`WAITING`, `cancelledAt` `NULL`) | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-005 | Operator gets 403 | API+DB | customer1 `WAITING` entry E | operator1 (assigned) and operator2 (unassigned) cancel E with valid CSRF | both `403 FORBIDDEN`; E unchanged | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-006 | No session gets 401 | API+DB | customer1 `WAITING` entry E | cancel E with no cookie; and with a logged-out session cookie | both `401 UNAUTHORIZED`; E unchanged | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-007 | CSRF enforced | API+DB | customer1 `WAITING` entry E | customer1 cancels E with no `X-CSRF-Token`; with a wrong token | both `403 FORBIDDEN`; E unchanged | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-008 | Malformed and unknown ids | API+DB | customer1 signed in | cancel `not-a-uuid`, a UUIDv1-shaped id, and a valid but unknown UUIDv4 | `400 INVALID_ARGUMENT`, `400 INVALID_ARGUMENT`, `404 RESOURCE_NOT_FOUND`; no row changed | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-009 | Cancel allowed on a CLOSED queue | API+DB | customer1 joins General Inquiry Desk; the queue is then set to `CLOSED` in the DB | cancel the entry | `200`, `CANCELLED` | AC-20 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-010 | Rejoin after cancel gets a new, larger number | API+DB | customer1 joins (number N), cancels | customer1 joins the same queue again | `201`, new entry `WAITING` with number > N and a different id; the cancelled row still exists with number N; `lastQueueNumber` did not move backwards | AC-21 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-011 | Active-entry guard still holds | API+DB | after CANCEL-010's rejoin (one `CANCELLED`, one `WAITING`) | (a) customer1 joins again via API; (b) direct DB insert of a second `WAITING` row for the same customer and queue; (c) read the index definition from `pg_indexes` | (a) `409 DUPLICATE_ACTIVE_ENTRY`; (b) unique violation (`P2002`); (c) predicate still lists exactly `WAITING`, `CALLED`, `SERVING` | AC-21 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-012 | Cancelled entry skipped by Call Next; FIFO kept; hidden from operator | API+DB (cross-feature F-05) | WAITING entries in FIFO order: A (customer1), B (customer2), C (a third CUSTOMER user created by the test with the same seed hash, joined through the API) | read C's `aheadCount`; B cancels; read C's `aheadCount` again; operator1 lists entries; operator1 calls next twice | C's `aheadCount` goes from 2 to 1; operator list does not contain B and keeps A, C in FIFO order; first call returns A, second returns C; B stays `CANCELLED` with `calledAt` `NULL` | AC-22 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-013 | Call Next on a queue whose only entry was cancelled | API+DB | customer1 joins and cancels; no other entries | operator1 calls next | `204` with an empty body; the cancelled row unchanged | AC-22 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-014 | Race: cancel vs Call Next on the same entry | API+DB concurrency | per round: reset, customer1 joins (only entry) | fire `cancel` and `call-next` in parallel (`Promise.all`), 15 rounds | every round: exactly one of {cancel `200` and row `CANCELLED` with `calledAt` `NULL` and call-next `204`} or {call-next `200` with this entry, row `CALLED` with `cancelledAt` `NULL`, cancel `409` with code `INVALID_STATE_TRANSITION` or `CONCURRENT_MODIFICATION`}; never two successes on this entry; row invariant holds; no extra rows | AC-23 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-015 | Own-entry reads keep cancelled history | API+DB | customer1 joins and cancels E, then rejoins (F) | `GET /api/me/queue-entries`; `GET /api/me/queue-entries/E` | list contains both E (`CANCELLED`, `cancelledAt` set) and F (`WAITING`, `cancelledAt` `null`) newest first; detail of E returns `CANCELLED`, `aheadCount 0` | AC-17 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| CANCEL-016 | Leave queue control (component) | Client | mocked API returning entries in each status | render `EntryDetailPage`; open/close confirmation with mouse and `Escape`; confirm; mocked `200`, `409`, `404`, `403`, `500`; double click while busy | button only for `WAITING`; no request until confirmed; "Leaving queue..." and disabled while pending; exactly one `POST` for a double click; success shows "Cancelled", "You left this queue." and "Cancelled:" time; each error shows the §3.3 message; focus moves as specified | AC-24 | `client/src/test/f07-leaveQueue.test.tsx` | **passed** (61e9daf) |
| CANCEL-017 | E2E: join, cancel with confirmation, reload, rejoin | E2E | reset DB | customer1 joins via UI, opens details, Leave queue → Keep my place (no change in DB) → Leave queue → Yes, leave queue; reload; back to queues; join again | after confirm: badge "Cancelled", "Cancelled:" time equal to DB `cancelledAt`; same after reload; DB row `CANCELLED`; rejoin shows a larger queue number | AC-17, AC-21, AC-24 | `e2e/tests/f07-cancellation.spec.ts` | **passed** (61e9daf) |
| CANCEL-018 | E2E: no Leave queue button after operator calls | E2E | customer1 joined; detail page open showing Leave queue | operator1 calls next through the API; wait for the 10 s poll (or Refresh) | badge "Called"; no Leave queue button; a direct API cancel by customer1 returns `409` | AC-18, AC-24 | `e2e/tests/f07-cancellation.spec.ts` | **passed** (61e9daf) |
| CANCEL-019 | E2E: keyboard only and responsive | E2E | customer1 joined | keyboard-only: Tab to Leave queue, Enter, Escape, Enter, Tab to Yes, Enter; then at 360 × 800 and 1280 × 800 with the confirmation panel open | cancellation completes with the keyboard alone; no page-level horizontal overflow at either width | AC-24 | `e2e/tests/f07-cancellation.spec.ts` | **passed** (61e9daf) |
| CANCEL-020 | Race: two cancels of the same entry | API+DB concurrency | customer1 `WAITING` entry, 10 rounds | two parallel cancels by customer1 | exactly one `200` and one `409` (`INVALID_STATE_TRANSITION` or `CONCURRENT_MODIFICATION`) per round; one `cancelledAt` value | AC-23 | `server/tests/f07-customer-cancellation.test.ts` | **passed** (61e9daf) |
| REG-S2-001 | Sprint 1 regression unchanged | All | none | `npm run test`, `npm run test:client`, `npm run test:e2e`, server and client typecheck | all Sprint 1 tests pass with no Sprint 1 test file edited | AC-01–AC-16 | existing `server/tests/*.test.ts`, `client/src/test/*.test.tsx`, `e2e/tests/*.spec.ts` | **passed** (61e9daf) |
| PERF-S2-001 | NFR-04 for F-07 | Performance (standalone script, not in `npm test`) | 1,000 WAITING entries (1,000 customers) in the OPEN queue; same method as PERF-001 (real app on a local port, real cookies + CSRF, sequential, 5 warm-ups + 100 timed requests per operation) | 1. cancel 105 different own WAITING entries (every 9th); 2. operator entry list; 3. own entry detail with 105 cancelled ahead; 4. rejoin by the 105 cancellers; 5. Call Next with cancelled entries ahead | p95 ≤ 1,000 ms for mutations (1, 4, 5) and ≤ 500 ms for reads (2, 3); functional checks inside the run: every cancel returns `CANCELLED`, list has no `CANCELLED` rows and 895 entries, `aheadCount` = 894, rejoin number > 1,000, first Call Next takes number 2 (number 1 is cancelled), no cancelled entry ever gets `calledAt` | NFR-04 (operations of AC-17, AC-21, AC-22) | `server/tests/nfr/perf-s2-001-cancel.ts` (`npm run test:perf:f07 --workspace=server`) | **passed** (run 2026-11-27, see §6) |

The E2E forbidden paths (non-owner, operator) are covered at the API level in CANCEL-004 and CANCEL-005, not only by the UI hiding the button.

## 3. Acceptance criteria coverage

| AC | Tests |
|---|---|
| AC-17 | CANCEL-002, CANCEL-015, CANCEL-017 |
| AC-18 | CANCEL-001, CANCEL-003, CANCEL-018 |
| AC-19 | CANCEL-004, CANCEL-005, CANCEL-006, CANCEL-007, CANCEL-008 |
| AC-20 | CANCEL-009 |
| AC-21 | CANCEL-010, CANCEL-011, CANCEL-017 |
| AC-22 | CANCEL-012, CANCEL-013 |
| AC-23 | CANCEL-014, CANCEL-020 |
| AC-24 | CANCEL-016, CANCEL-017, CANCEL-018, CANCEL-019 |

## 4. Row invariant asserted after every API+DB scenario

```sql
SELECT id FROM "QueueEntry" WHERE NOT (
  ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "calledAt" IS NULL AND "serviceStartedAt" IS NULL AND "completedAt" IS NULL)
  OR ("status" <> 'CANCELLED' AND "cancelledAt" IS NULL)
);
-- expected: zero rows
```

Plus: no two active (`WAITING`/`CALLED`/`SERVING`) rows for one `(customerId, serviceQueueId)`, and no duplicate `(serviceQueueId, queueNumber)`.

## 5. Not planned in F-07

- *Rev. 1.2:* NFR-04 is measured for F-07 by the new PERF-S2-001. PERF-001 (`server/tests/nfr/perf-001.ts`) and its Sprint 1 evidence are unchanged. Previous text (v1.0): "PERF-001 is not extended to the cancel mutation (NFR-04 is not re-measured for it)."
- Concurrent-load or throughput tests are not planned (same limit as PERF-001: sequential latency on one machine).
- Firefox and WebKit E2E runs are optional (`npm run test:e2e:all-browsers`); the default run is Chromium.
- Production database migration and release deploy are outside this feature's verification.

## 6. Execution results

All runs: local PostgreSQL 16 (Docker `qms-postgres`), isolated `qms_test_db`, Chromium. Raw output: [evidence/f07-red-run.txt](./evidence/f07-red-run.txt), [evidence/f07-green-run.txt](./evidence/f07-green-run.txt).

| Run | Commit under test | Command | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Baseline (before F-07) | `e304cd9` | `npm run test` / `npm run test:client` / `npm run test:e2e` | 140 / 77 / 12 | 0 | 0 |
| Red, server | `f98c296` + tests (red commit `477febb`) | `npx vitest run tests/f07-*.test.ts` | 0 | 21 | 0 |
| Red, client | same | `npx vitest run src/test/f07-leaveQueue.test.tsx` | 4 (absence checks, pass trivially without the feature) | 10 | 0 |
| Red, E2E | same | `npx playwright test ... f07-cancellation.spec.ts` | 0 | 3 | 0 |
| Green, server (full) | `61e9daf` | `npm run test` | 161 (140 Sprint 1 + 21 F-07) | 0 | 0 |
| Green, client (full) | `61e9daf` | `npm run test:client` | 91 (77 + 14) | 0 | 0 |
| Green, E2E Chromium (full) | `61e9daf` | `npm run test:e2e` | 15 (12 + 3) | 0 | 0 |
| Green, static | `61e9daf` | server + client typecheck, `npm run build`, `docker build` | all exit 0 | — | — |

Red failures were all caused by missing behavior: the route did not exist (catch-all `404`), the column `cancelledAt` did not exist (PostgreSQL `42703`), the rule stub threw "Not implemented", and the UI had no "Leave queue" button.

Actual test files and names:

| Test IDs | File | Test name prefix |
|---|---|---|
| CANCEL-001 | `server/tests/f07-cancel-rule.test.ts` | `F-07 CANCEL-001: ...` (6 cases) |
| CANCEL-002 – CANCEL-015, CANCEL-020 | `server/tests/f07-customer-cancellation.test.ts` | `CANCEL-0NN (AC-NN): ...` |
| CANCEL-016 | `client/src/test/f07-leaveQueue.test.tsx` | `F-07 CANCEL-016: Leave queue control > ...` (14 cases) |
| CANCEL-017 – CANCEL-019 | `e2e/tests/f07-cancellation.spec.ts` | `CANCEL-017: ...`, `CANCEL-018: ...`, `CANCEL-019: ...` |
| REG-S2-001 | existing Sprint 1 suites (no file edited) | — |

CANCEL-014 race outcomes (both are valid): in the first green run, cancel won 14 rounds and Call Next won 1. In the full green run, cancel won 15 and Call Next won 0. Each round asserts that exactly one transition was applied.

Not run: Firefox and WebKit E2E. (v1.1 also listed "PERF-001 for the cancel mutation"; that is now covered by PERF-S2-001 below.)

### 6.1 PERF-S2-001 / NFR-04 (measured)

**PASSED.** Command: `npm run test:perf:f07 --workspace=server`. Run 2026-11-27 on the F-07 implementation (`61e9daf` code; the script itself added after `3e90e86`). Host: Windows 11, Intel i5-11400H ×12, 16 GiB RAM, Node 22.20.0; PostgreSQL 16.15 in Docker, `qms_test_db`. Raw output: [evidence/perf-s2-001.txt](./evidence/perf-s2-001.txt).

| Operation | Kind | n | p50 ms | p95 ms | max ms | Target p95 | Result |
|---|---|---|---|---|---|---|---|
| `POST /api/me/queue-entries/:id/cancel` | mutation | 100 | 10.3 | 16.4 | 21.6 | ≤ 1,000 | PASS |
| `GET /api/operator/queues/:id/entries` (CANCELLED filtered, 895 rows) | read | 100 | 27.1 | 47.0 | 50.8 | ≤ 500 | PASS |
| `GET /api/me/queue-entries/:id` (105 CANCELLED ahead) | read | 100 | 4.9 | 6.7 | 8.8 | ≤ 500 | PASS |
| `POST /api/queues/:id/entries` (rejoin after cancel) | mutation | 100 | 10.6 | 15.3 | 19.4 | ≤ 1,000 | PASS |
| `POST /api/operator/queues/:id/call-next` (CANCELLED ahead) | mutation | 100 | 13.8 | 17.9 | 28.0 | ≤ 1,000 | PASS |

Limits: one sequential run on one developer machine against a local database, like PERF-001. It says nothing about Cloud Run or Cloud SQL latency, or about concurrent load.

---

## 7. F-08 No-show handling and recovery

Added in v2.0 (contract v1, issue #41). §1 conventions apply. In addition, "unchanged" for F-08 tests also covers `noShowAt`, `recoveredAt` and `noShowCount`. Requirements: [SRS](../../srs.md) v3.0 §10.1 (AC-25–AC-34). API: [api-spec.md](./api-spec.md) §9. UI: [ui-spec.md](./ui-spec.md) §6–§9. Design: [F-08 feature SDS](../../features/sprint-2-f08-no-show-recovery.md).

Helper used below: "A is called" means operator1 sends Call Next on General Inquiry Desk and A is the oldest `WAITING` entry. "customer3" is a third CUSTOMER user created by the test with the seed hash and joined through the API (as in CANCEL-012).

### 7.1 Test matrix

| ID | Name | Level | Setup | Input | Expected outcome | AC | Planned file | Status |
|---|---|---|---|---|---|---|---|---|
| NOSHOW-001 | No-show and recovery rules | Unit | none | `canMarkNoShow(status)` for all six statuses; `recoveryDecision({status, noShowCount})` for every status with counts 0, 1, 2 | `canMarkNoShow` true only for `CALLED`; `recoveryDecision` is `ok` only for `NO_SHOW` with count 1, `limit` for `NO_SHOW` with count 2, `invalid_state` otherwise | AC-26, AC-29 | `server/tests/f08-no-show-rule.test.ts` | **passed** (37fd6c0) |
| NOSHOW-002 | Mark a CALLED entry no-show | API+DB | customer1 joins (A), A is called | operator1 `POST .../A/no-show` | `200`; `status` `NO_SHOW`, `noShowAt` RFC 3339 UTC ≥ `calledAt`, `noShowCount` 1, `recoveredAt` `null`, `queueNumber`, `joinedAt`, `calledAt` unchanged; DB row the same; customer1 `GET /api/me/queue-entries/A` shows `NO_SHOW`, `aheadCount` 0. Repeated with the queue set to `CLOSED` after the call: also `200` | AC-25 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-003 | Mark no-show rejected in other states | API+DB | customer1 entries driven to `WAITING`, `SERVING`, `COMPLETED`, `CANCELLED` and `NO_SHOW` | operator1 marks each no-show | each `409 INVALID_STATE_TRANSITION`; each row unchanged | AC-26 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-004 | Access control on no-show | API+DB | customer1 entry A `CALLED` | operator2 (unassigned) with CSRF; customer1 (owner) with CSRF; customer2; no cookie; operator1 without CSRF and with a wrong token; operator1 on `not-a-uuid` and on an unknown UUIDv4 | `403`, `403`, `403`, `401`, `403`, `403`, `400 INVALID_ARGUMENT`, `404 RESOURCE_NOT_FOUND`; A unchanged after each | AC-27 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-005 | Access control on recover | API+DB | customer1 entry A `NO_SHOW` (count 1) | the same eight callers as NOSHOW-004 on `POST .../recover` | the same eight results; A unchanged after each | AC-27 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-006 | Return to queue at the original FIFO position | API+DB (cross-feature F-05) | A (customer1), B (customer2), C (customer3) join in that order; A called and marked no-show; B called; read C's `aheadCount` (0) | operator1 recovers A; read C's `aheadCount`; Call Next | recover `200`: A `WAITING`, `calledAt` `null`, `recoveredAt` UTC set, `noShowAt` kept, `noShowCount` 1, `joinedAt` and number unchanged; C's `aheadCount` is 1; Call Next returns A (not C). Repeated with the queue `CLOSED` before the recover: `200` | AC-28 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-007 | Recovery limit and wrong states | API+DB | A recovered once, called, marked no-show again (`noShowCount` 2); other entries in `WAITING`, `CALLED`, `SERVING`, `COMPLETED`, `CANCELLED` | recover A; recover each of the others | A: `409 RECOVERY_LIMIT_REACHED`, unchanged (`noShowAt` is the second no-show time); others: `409 INVALID_STATE_TRANSITION`, unchanged | AC-29 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-008 | Database keeps `noShowCount` in range | API+DB | customer1 entry | raw `UPDATE ... SET "noShowCount" = 3` and `= -1`; read `pg_constraint` | both fail with a check-constraint violation (SQLSTATE `23514`); constraint `QueueEntry_noShowCount_range_check` exists; the active-entry index definition is unchanged | AC-29 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-009 | Rejoin while NO_SHOW blocks a later return | API+DB | A (customer1, number N) `NO_SHOW` | customer1 joins the same queue; operator1 recovers A | join `201`, new `WAITING` entry with number > N; recover `409 DUPLICATE_ACTIVE_ENTRY`; A unchanged | AC-30 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-010 | F-07 cancel and NO_SHOW | API+DB (cross-feature F-07) | A (customer1) `NO_SHOW` | customer1 cancels A; operator1 recovers A; customer1 cancels A | first cancel `409 INVALID_STATE_TRANSITION`, A unchanged; recover `200`; second cancel `200`, A `CANCELLED` with `calledAt` `NULL` and `noShowAt` kept | AC-30 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-011 | Call Next, operator list and aheadCount with NO_SHOW | API+DB (cross-feature F-05) | A (customer1), B (customer2) join; A called and marked no-show; customer3 joins (C) | read C's `aheadCount`; operator list; Call Next twice | C's `aheadCount` is 1 (only B); operator list contains A as `NO_SHOW` with `noShowAt`, `noShowCount`, `recoveredAt` in `joinedAt ASC` order; Call Next returns B, then C, then `204`; A unchanged | AC-31 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-012 | Race: no-show vs Start on one CALLED entry | API+DB concurrency | per round: reset, customer1 joins, called; 10 rounds | `no-show` and `start` in parallel | each round: exactly one `200` and one `409 INVALID_STATE_TRANSITION`; row is `NO_SHOW` with `serviceStartedAt` `NULL`, or `SERVING` with `noShowAt` `NULL` and `noShowCount` 0 | AC-32 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-013 | Race: two returns of one NO_SHOW entry | API+DB concurrency | per round: A `NO_SHOW` count 1; 10 rounds | two parallel `recover` | each round: one `200`, one `409 INVALID_STATE_TRANSITION`; one `recoveredAt` value | AC-32 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-014 | Race: return vs rejoin by the same customer | API+DB concurrency | per round: A (customer1) `NO_SHOW` count 1; 10 rounds | operator1 `recover` A and customer1 `join` the same queue in parallel | each round: never two active entries for customer1 in the queue; either recover `200` + join `409 DUPLICATE_ACTIVE_ENTRY`, or join `201` + recover `409 DUPLICATE_ACTIVE_ENTRY` | AC-32 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-015 | Operator page controls (component) | Client | mocked API with entries in every status, `NO_SHOW` with counts 1 and 2 | render `OperatorQueueDetailPage`; click Mark no-show and Return to queue; mocked `200`, `409 RECOVERY_LIMIT_REACHED`, `409 DUPLICATE_ACTIVE_ENTRY`, other `409`, `404`, `403`, `500`; double click while busy | Mark no-show only on `CALLED`; No-show section and count; Return only for count 1, "Already returned once..." for count 2; busy texts; one request per double click; messages from ui-spec §8.3; list reloaded on `409`/`404` | AC-33 | `client/src/test/f08-noShow.test.tsx` | **passed** (37fd6c0) |
| NOSHOW-016 | Customer page for NO_SHOW (component) | Client | mocked API returning `NO_SHOW` count 1, count 2, and a returned `WAITING` entry | render `EntryDetailPage` | badge "No-show", "Missed:" time, the two messages of ui-spec §7, no Leave queue button for `NO_SHOW`; polling continues for count 1 and stops for count 2; returned entry shows "Waiting", "Returned to queue:" and Leave queue | AC-34 | `client/src/test/f08-noShow.test.tsx` | **passed** (37fd6c0) |
| NOSHOW-017 | E2E: operator marks no-show, returns, marks again | E2E | reset DB; customer1 and customer2 join through the API | operator1 in the UI: Call Next → Mark no-show (customer1's entry) → it is in the No-show section → Return to queue → it is #1 in the Waiting Queue → Call Next calls it → Mark no-show → "Already returned once" and no Return button | every step visible without reload; DB row matches after each step (`noShowCount` 1 then 2) | AC-33, AC-28, AC-29, AC-25 | `e2e/tests/f08-no-show.spec.ts` | **passed** (37fd6c0) |
| NOSHOW-018 | E2E: customer sees No-show, then Waiting after return | E2E | customer1 joined, called and marked no-show through the API | customer1 opens the entry detail page; operator1 returns it through the API; Refresh | page shows "No-show", "Missed:" and the first message, no Leave queue button; after Refresh "Waiting", "Returned to queue:" and the Leave queue button | AC-34 | `e2e/tests/f08-no-show.spec.ts` | **passed** (37fd6c0) |
| NOSHOW-019 | E2E: keyboard only and responsive | E2E | entries in Waiting, Active (`CALLED`) and No-show sections | keyboard only: Tab to Mark no-show, Enter; Tab to Return to queue, Enter; then 360 × 800 and 1280 × 800 | both actions succeed with the keyboard alone; no page-level horizontal overflow at either width | AC-33 | `e2e/tests/f08-no-show.spec.ts` | **passed** (37fd6c0) |
| NOSHOW-020 | Start and Complete reject NO_SHOW | API+DB (cross-feature F-05) | A `NO_SHOW` | operator1 `start` and `complete` A | both `409 INVALID_STATE_TRANSITION`; A unchanged | AC-26 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (37fd6c0) |
| NOSHOW-021 | Return is rejected at the BR-06 cap, then allowed once a slot is free | API+DB | customer1 joins Q1 (A) and two extra OPEN queues Q2, Q3 created by the test with operator1 assigned to Q1; A called and marked `NO_SHOW`; customer1 joins Q2 and Q3 (2 active) | operator1 `recover` A; then complete customer1's Q2 entry; `recover` A again | first: `409 MAX_ACTIVE_ENTRIES_REACHED`, A unchanged (`NO_SHOW`, count 1, `recoveredAt` NULL); second: `200`, A `WAITING`; customer1 never has more than 2 active entries | AC-45 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (4c6c7a7; red b0ebcb7) |
| NOSHOW-022 | Race: return vs join of a third queue by the same customer | API+DB concurrency | per round: A (customer1, Q1) `NO_SHOW` count 1, customer1 active in Q2; 10 rounds | operator1 `recover` A and customer1 `join` Q3 in parallel | each round: exactly one succeeds and the other gets `409 MAX_ACTIVE_ENTRIES_REACHED`; customer1 has exactly 2 active entries; no deadlock | AC-45 | `server/tests/f08-no-show-recovery.test.ts` | **passed** (4c6c7a7; red b0ebcb7) |
| NOSHOW-023 | Operator message for a return blocked by the cap | Client | mocked API: Return to queue returns `409 MAX_ACTIVE_ENTRIES_REACHED` | render `OperatorQueueDetailPage`, click Return to queue | alert shows "This customer already has 2 active queue entries, so this entry cannot be returned right now."; the entries list is fetched again | AC-45 | `client/src/test/f08-noShow.test.tsx` | **passed** (4c6c7a7; red b0ebcb7) |
| REG-S2-002 | Sprint 1 and F-07 regression unchanged | All | none | `npm run test`, `npm run test:client`, `npm run test:e2e`, server and client typecheck | all Sprint 1 and F-07 tests pass with no existing test file edited | AC-01–AC-24 | existing `server/tests/*.test.ts`, `client/src/test/*.test.tsx`, `e2e/tests/*.spec.ts` | **passed** (37fd6c0) |
| PERF-S2-002 | NFR-04 for F-08 | Performance (standalone script) | 1,000 `WAITING` entries in the OPEN queue; PERF-001 method | 1. Call Next + mark no-show for 105 entries (only no-show timed); 2. operator list with 105 `NO_SHOW` rows; 3. recover the 105 entries; 4. own entry detail with `NO_SHOW` rows in the queue | p95 ≤ 1,000 ms for the mutations, ≤ 500 ms for reads; functional checks: every response has the expected status | NFR-04 (operations of AC-25, AC-28, AC-31) | `server/tests/nfr/perf-s2-002-no-show.ts` (`npm run test:perf:f08 --workspace=server`) | **passed** (run 2026-11-27 on the `37fd6c0` code, see §7.5) |

### 7.2 Acceptance criteria coverage

| AC | Tests |
|---|---|
| AC-25 | NOSHOW-002, NOSHOW-017 |
| AC-26 | NOSHOW-001, NOSHOW-003, NOSHOW-020 |
| AC-27 | NOSHOW-004, NOSHOW-005 |
| AC-28 | NOSHOW-006, NOSHOW-017 |
| AC-29 | NOSHOW-001, NOSHOW-007, NOSHOW-008, NOSHOW-017 |
| AC-30 | NOSHOW-009, NOSHOW-010 |
| AC-31 | NOSHOW-011 |
| AC-32 | NOSHOW-012, NOSHOW-013, NOSHOW-014 |
| AC-33 | NOSHOW-015, NOSHOW-017, NOSHOW-019 |
| AC-34 | NOSHOW-016, NOSHOW-018 |
| AC-45 | NOSHOW-021, NOSHOW-022, NOSHOW-023 |

### 7.3 Row invariants asserted after every F-08 API+DB scenario

```sql
SELECT id FROM "QueueEntry" WHERE NOT (
  ("status" <> 'NO_SHOW' OR ("noShowAt" IS NOT NULL AND "calledAt" IS NOT NULL AND "noShowCount" >= 1
                             AND "serviceStartedAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL))
  AND (("noShowCount" = 0) = ("noShowAt" IS NULL))
  AND ("recoveredAt" IS NULL OR "noShowCount" >= 1)
  AND ("noShowCount" < 2 OR "recoveredAt" IS NOT NULL)
  AND ("status" <> 'WAITING' OR "calledAt" IS NULL)
);
-- expected: zero rows
```

Plus the F-07 checks of §4 (no two active rows for one customer and queue; no duplicate queue number).

### 7.4 Not planned in F-08

- Firefox and WebKit E2E (optional, `npm run test:e2e:all-browsers`).
- Concurrent-load tests beyond the races in NOSHOW-012 – NOSHOW-014.
- Production migration and release deploy.

### 7.5 Execution results (F-08)

All runs: local PostgreSQL 16 (Docker `qms-postgres`), isolated `qms_test_db`, Chromium. Raw output: [evidence/f08-red-run.txt](./evidence/f08-red-run.txt), [evidence/f08-green-run.txt](./evidence/f08-green-run.txt), [evidence/perf-s2-002.txt](./evidence/perf-s2-002.txt).

| Run | Commit under test | Command | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Baseline (before F-08, not re-run) | F-07 green run at `61e9daf` (§6); `sprint2-staging` at `f51becf` adds only the PERF-S2-001 script and docs on top of it | `npm run test` / `npm run test:client` / `npm run test:e2e` | 161 / 91 / 15 | 0 | 0 |
| Red, server | `7e42e1f` + tests (red commit `f6a4183`) | `npx vitest run tests/f08-no-show-rule.test.ts tests/f08-no-show-recovery.test.ts` | 1 (checks the exported constant only) | 40 | 0 |
| Red, client | same | `npx vitest run src/test/f08-noShow.test.tsx` | 0 | 14 | 0 |
| Red, E2E | same | `npx playwright test ... f08-no-show.spec.ts` | 0 | 3 | 0 |
| Green, server (full) | `37fd6c0` | `npm run test` | 202 (161 + 41 F-08) | 0 | 0 |
| Green, client (full) | `37fd6c0` | `npm run test:client` | 105 (91 + 14) | 0 | 0 |
| Green, E2E Chromium (full) | `37fd6c0` | `npm run test:e2e` | 18 (15 + 3) | 0 | 0 |
| Green, static | `37fd6c0` | server + client typecheck, `npm run build`, `docker build`, `prisma migrate diff` (test DB → schema) | all exit 0; diff empty | — | — |
| PERF-S2-002 | `37fd6c0` code; script in `b65c0d2` | `npm run test:perf:f08 --workspace=server` | 4 / 4 operations within target | 0 | 0 |

Red failures were all caused by missing behavior: the routes did not exist (catch-all `404`), the columns did not exist (PostgreSQL `42703`), the enum value did not exist (`22P02`), the rule stub threw "Not implemented", and the UI had no no-show controls or `NO_SHOW` display.

PERF-S2-002 (NFR-04), p95: no-show 30.4 ms, recover 41.7 ms (target ≤ 1,000 ms); operator list with 105 `NO_SHOW` rows 117.4 ms, own entry detail 20.9 ms (target ≤ 500 ms). One sequential run on one developer machine, like PERF-001.

Race outcomes (each round asserts that exactly one transition was applied): NOSHOW-012 no-show won 10 / Start won 0 in the full green run (9 / 1 in the first F-08 run). NOSHOW-014: the join won all 10 rounds in both runs, so the "return wins" branch was not observed; that branch relies on the queue-row lock described in the feature SDS §10. NOSHOW-013 always gives one `200` and one `409` by construction.

Actual test files:

| Test IDs | File | Test name prefix |
|---|---|---|
| NOSHOW-001 | `server/tests/f08-no-show-rule.test.ts` | `F-08 NOSHOW-001: ...` (25 cases) |
| NOSHOW-002 – NOSHOW-014, NOSHOW-020 | `server/tests/f08-no-show-recovery.test.ts` | `NOSHOW-0NN (AC-NN): ...` (16 tests) |
| NOSHOW-015, NOSHOW-016 | `client/src/test/f08-noShow.test.tsx` | `F-08 NOSHOW-015: ...`, `F-08 NOSHOW-016: ...` (14 cases) |
| NOSHOW-017 – NOSHOW-019 | `e2e/tests/f08-no-show.spec.ts` | `NOSHOW-017: ...` – `NOSHOW-019: ...` |
| NOSHOW-021, NOSHOW-022 | `server/tests/f08-no-show-recovery.test.ts` | `NOSHOW-021 (AC-45): ...`, `NOSHOW-022 (AC-45): ...` (red `b0ebcb7`, green `4c6c7a7`; evidence `f08-br06-red-run.txt`, `f08-br06-green-run.txt`) |
| NOSHOW-023 | `client/src/test/f08-noShow.test.tsx` | `F-08 NOSHOW-023: ...` (same commits and evidence) |
| PERF-S2-002 | `server/tests/nfr/perf-s2-002-no-show.ts` | — |
| REG-S2-002 | existing Sprint 1 and F-07 suites (no file edited) | — |

Not run: Firefox and WebKit E2E.

---

## 8. F-09 Multi-counter support

Added in v3.0 (contract v1, issue #42; revised in v3.1 contract v1.1, v3.2 contract v1.2, v3.3 initial green run, and v3.4 contract v1.3 review fixes). §1 conventions apply. In addition, "unchanged" for F-09 tests covers `Counter.status`, `Counter.assignedOperatorId`, `Counter.updatedAt`, and `QueueEntry.counterId` alongside all existing `QueueEntry` fields. Requirements: [SRS](../../srs.md) v4.3 §10.2 (AC-35–AC-44). API: [api-spec.md](./api-spec.md) v3.3 (§12–§16). UI: [ui-spec.md](./ui-spec.md) v3.2 (§10–§13). Design: [F-09 feature SDS](../../features/sprint-2-f09-multi-counter.md).

Helpers used below: `C1` (`cccccccc-cccc-4ccc-8ccc-ccccccccccc1`, `Counter 1`) and `C2` (`cccccccc-cccc-4ccc-8ccc-ccccccccccc2`, `Counter 2`) are the seeded `OPEN` counters of General Inquiry Desk (`queue1`). "operator3" is a second `OPERATOR` user created by a test and assigned to `queue1` when testing `assignedOperatorId` scoping.

### 8.1 Test matrix

| ID | Name | Level | Setup | Input | Expected outcome | AC | Planned file | Status |
|---|---|---|---|---|---|---|---|---|
| COUNTER-001 | Counter status and operator-scope policy rules | Unit | none | `canCallNextOnCounter(status)` for `OPEN`/`CLOSED`; `isCounterStatusValid(value)` for valid/invalid strings; `canOperatorUseCounter(isQueueAssigned, assignedOperatorId, operatorId)` across null/matching/mismatched operator IDs | `canCallNextOnCounter` true only for `OPEN`; `isCounterStatusValid` true only for `'OPEN'` and `'CLOSED'`; `canOperatorUseCounter` true only when queue-assigned and (`assignedOperatorId` is `null` or equals `operatorId`) | AC-37, AC-39 | `server/tests/f09-counter-rule.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-002 | List counters for assigned queue | API+DB | `resetAndSeed()` | operator1 `GET /api/operator/queues/{queue1}/counters` | `200`; `data.counters` has `[Counter 1, Counter 2]` ordered by `name ASC, id ASC`, each with `id`, `serviceQueueId`, `name`, `status: 'OPEN'`, `assignedOperatorId: null`, and RFC 3339 UTC `createdAt`/`updatedAt` | AC-35 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-003 | Toggle counter status OPEN ↔ CLOSED and validate payload | API+DB | `resetAndSeed()`; for the `CLOSED` parent-queue sub-case, test setup explicitly inserts `OperatorAssignment(operator1, queue2)` (since `seed.ts` assigns `operator1` only to `queue1`) while keeping `queue2` as `CLOSED` | operator1 `PATCH /api/operator/counters/{C1}/status` with `{"status":"CLOSED"}`, repeat `{"status":"CLOSED"}`, then `{"status":"OPEN"}`; toggle `queue2`'s `Counter 1` (`dddddddd-...-ddd1`) to `CLOSED` and back to `OPEN`; plus invalid bodies `{}`, `{"status":"PAUSED"}`, `{"status":123}`, `{"status":"OPEN","extra":true}` | Valid toggles return `200` with persisted status in DB on fresh query; repeat returns `200` idempotently; `CLOSED` parent queue (`queue2`) succeeds with `200` once `operator1` is assigned to `queue2`; all invalid bodies return `400 INVALID_ARGUMENT` with counter unchanged | AC-36 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-004 | Access control and validation on GET queue counters | API+DB | `resetAndSeed()` | `GET /api/operator/queues/{id}/counters` by: anonymous; customer1; operator2 (unassigned); operator1 with `not-a-uuid`; operator1 with unknown valid UUIDv4 | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `403 FORBIDDEN`, `400 INVALID_ARGUMENT`, `404 RESOURCE_NOT_FOUND` (matching `requireQueueAssignment`) | AC-37 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-005 | Access control and validation on PATCH status and POST counter call-next | API+DB | `resetAndSeed()`; customer1 joins `queue1`; also test with `C2.assignedOperatorId = operator3` while operator1 is assigned to `queue1` | Both `PATCH .../counters/{id}/status` and `POST .../counters/{id}/call-next` by: anonymous; customer1 with CSRF; operator2 (unassigned) with CSRF; operator1 on `C2` owned by operator3; operator1 with missing/wrong CSRF; operator1 with `not-a-uuid`; operator1 with unknown valid UUIDv4 | `401`, `403`, `403`, `403`, `403`, `403`, `400 INVALID_ARGUMENT`, `404 RESOURCE_NOT_FOUND`; counters and entries unchanged after each | AC-37 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-006 | Counter-scoped Call Next assigns counterId and counterName in FIFO order | API+DB | customer1 (A) and customer2 (B) join `queue1` in order | operator1 calls `POST .../counters/{C1}/call-next`, then `POST .../counters/{C2}/call-next`; read operator entries list and customer1 own list & detail | C1 returns `200` with A (`CALLED`, `calledAt` UTC, `counterId: C1`, `counterName: 'Counter 1'`); C2 returns `200` with B (`counterId: C2`, `counterName: 'Counter 2'`); DB rows match; `GET /api/operator/queues/{queue1}/entries`, `GET /api/me/queue-entries`, and `GET /api/me/queue-entries/{A}` all include `counterId` and `counterName` | AC-38 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-007 | Closed counter rejects Call Next; in-flight entries at closed counter can still finish | API+DB | customer1 (A) and customer2 (B) join; A called at C1; C1 toggled to `CLOSED` | operator1 calls `POST .../counters/{C1}/call-next`; then operator1 runs `start` and `complete` on A (and in a sub-case `no-show` on a `CALLED` entry at C1) | `call-next` on closed C1 returns `409 COUNTER_CLOSED` and B stays `WAITING` (`counterId: null`); `start`, `complete`, and `no-show` on A all return `200` preserving `counterId: C1`, `counterName: 'Counter 1'` | AC-39 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-008 | Empty queue on counter Call Next returns 409 NO_WAITING_ENTRIES; CLOSED parent queue still callable | API+DB | (a) empty `queue1`; (b) customer1 joins `queue1`, then `queue1` set to `CLOSED` in DB | (a) operator1 `POST .../counters/{C1}/call-next`; (b) operator1 `POST .../counters/{C1}/call-next` | (a) `409 NO_WAITING_ENTRIES`, no DB change; (b) `200` with entry `CALLED` and `counterId: C1` | AC-38, AC-39 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-009 | Legacy queue-level Call Next remains backward compatible and writes `counterId = NULL` | API+DB | customer1 joins `queue1` (also sub-case where an entry was called at `C1`, marked `NO_SHOW`, recovered to `WAITING`, and then called via legacy Call Next) | operator1 `POST /api/operator/queues/{queue1}/call-next` twice | First returns `200` with `counterId: null`, `counterName: null` and DB `counterId IS NULL` (explicitly set by legacy `UPDATE`); second returns `204 No Content` with empty body | AC-39 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-010 | Race: parallel multi-counter Call Next across C1 and C2 | API+DB concurrency | 15 rounds each: (a) 2 `WAITING` entries A, B; (b) 1 `WAITING` entry A | Fire `POST .../counters/{C1}/call-next` and `POST .../counters/{C2}/call-next` in parallel (`Promise.all`) | (a) Every round: both `200`, claiming two distinct entries `{A, B}` with zero double-claims, zero lost updates, and matching `counterId` in DB (sequential FIFO order is verified in COUNTER-006); (b) every round: exactly one `200` (entry `CALLED` with winning counter's `counterId`) and one `409 NO_WAITING_ENTRIES`; zero deadlocks; row invariants hold | AC-40 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-011 | Race: counter Call Next vs Close Counter on the same counter | API+DB concurrency | 15 rounds: reset, customer1 joins `queue1`, C1 is `OPEN` | Fire `POST .../counters/{C1}/call-next` and `PATCH .../counters/{C1}/status` (`CLOSED`) in parallel (`Promise.all`) | Every round: zero deadlocks; status update always `200` (`CLOSED`); Call Next is either `200` (won lock first, entry `CALLED` at C1) or `409 COUNTER_CLOSED` (lost lock, entry stays `WAITING` with `counterId: null`); row invariants hold | AC-40 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-012 | Cross-feature F-08 recovery clears counterId and F-07 cancel/NO_SHOW skipped | API+DB (cross-feature F-07, F-08) | customer1 (A) and customer2 (B) join; A called at C1, marked `NO_SHOW`, then recovered; B cancelled by customer2 | Verify A after `NO_SHOW` (`counterId: C1`), after `recover` (`WAITING`, `calledAt: null`, `counterId: null`, `counterName: null`), then call next at C2; verify B (`CANCELLED`) has `counterId: null` and is skipped | Recovery clears `counterId` to `null`; subsequent Call Next at C2 assigns A to `C2` (`counterName: 'Counter 2'`); B stays `CANCELLED` with `counterId: null`; next Call Next returns `409 NO_WAITING_ENTRIES` | AC-41 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-013 | Database constraints (including composite FK `ON DELETE/UPDATE RESTRICT`) and idempotent `provision:counters` → `seed` | API+DB | `resetAndSeed()`; customer1 joins `queue1` (entry E) | (a) insert duplicate `(serviceQueueId, name)` into `Counter`; (b) update `QueueEntry.counterId` on E to an unknown UUID; (c) update `QueueEntry.counterId` on E (`queue1`) to a valid `Counter.id` belonging to `queue2` (`dddddddd-...-ddd1`); (d) verify `QueueEntry.counterId = NULL` succeeds (`MATCH SIMPLE`); (e) call E at C1 and attempt `UPDATE "Counter" SET "serviceQueueId" = queue2, "name" = 'Counter 1 Reassigned' WHERE id = C1` + inspect `pg_constraint`; (f) toggle C1 to `CLOSED`, re-run `seed()`; (g) clear counters, run `provisionCounters(prisma)`, close one counter, then run `seed(prisma)` | (a) unique violation (`23505` / `P2002`); (b) FK violation (`23503`); (c) composite FK rejects cross-queue counter with `23503`; (d) `NULL` permitted under `MATCH SIMPLE`; (e) `ON UPDATE RESTRICT` rejects `serviceQueueId` update with `23503` and `pg_constraint` confirms `confupdtype = 'r'`, `confdeltype = 'r'`; (f) counter count stays 4, deterministic IDs unchanged, C1 stays `CLOSED`; (g) `provisionCounters` creates 4 counters and subsequent `seed()` succeeds with zero `P2002` errors while preserving provisioned IDs and `CLOSED` status | AC-41, AC-44 | `server/tests/f09-multi-counter.test.ts` | **passed** (local, 2026-11-27) |
| COUNTER-014 | Operator Counters panel, ownership states, strict loading/error/poll-error fallback gate, refetch, and strict entry badges (component) | Client | mocked API returning: (a) counters (`Counter 1` `OPEN`, `Counter 2` `CLOSED`, `Counter 3` assigned to another operator) and entries across `WAITING`, `CALLED`, `SERVING`, `COMPLETED`, `NO_SHOW` (including non-null `counterName` on `COMPLETED`/`NO_SHOW`); (b) queue where every counter is assigned to another operator; (c) pending load, initial `500`/`403` failure, and 10 s poll failure | Render `OperatorQueueDetailPage`; toggle counter status; click counter Call Next; verify disabled state on closed counter and on other-operator counter; check legacy Call Next fallback only when loaded with 0 usable counters; verify loading (`"Loading counters..."`), initial `500`/`403` error + Retry (legacy Call Next hidden), poll failure alert + disabled controls + Retry recovery; simulate `409 COUNTER_CLOSED`, `409 NO_WAITING_ENTRIES`, `404`, non-CSRF `403`, `500`, and double-click while busy | Counters section renders `Open`/`Closed` badges, toggle buttons, and Call Next (disabled on `CLOSED`); other-operator counter disables both toggle and Call Next and displays `"Assigned to another operator"`; legacy Call Next fallback renders **only** when `countersStatus === 'loaded' && !countersPollError` with 0 usable counters (never while loading or on initial/poll error); entry counter badge renders on `CALLED` and `SERVING` entries **only**; busy texts, single request per double-click, exact ui-spec §12.3 error messages, and `GET /counters` refresh on `409 COUNTER_CLOSED`, `409 NO_WAITING_ENTRIES`, `404`, and non-CSRF `403` (15 operator cases + 5 customer cases = 20 F-09 client cases) | AC-42 | `client/src/test/f09-multiCounter.test.tsx` | **passed** (local, 2026-11-27) |
| COUNTER-015 | Customer assigned counter prompt, fallback, and strict badge rule (component) | Client | mocked API returning entries: `CALLED` with `counterName`, `CALLED` with `null`, `SERVING` with `counterName`, `SERVING` with `null`, `WAITING` with `null`, plus `COMPLETED` and `NO_SHOW` with non-null `counterName` and `CANCELLED` | Render `EntryDetailPage` and `MyTicketsList` | `CALLED` + `Counter 1` renders `"Please proceed to Counter 1."` and badge; `SERVING` + `Counter 1` renders `"Your service is in progress at Counter 1."` and badge; `null` falls back to Sprint 1 text with no counter badge; no counter badge rendered on `WAITING`, `COMPLETED`, `NO_SHOW`, or `CANCELLED` on either `EntryDetailPage` or `MyTicketsList` | AC-43 | `client/src/test/f09-multiCounter.test.tsx` | **passed** (local, 2026-11-27) |
| COUNTER-016 | E2E: multi-counter Call Next, counter close, in-flight finish, and customer view | E2E | reset DB; customer1 and customer2 join `queue1` | Operator1 in UI calls next at Counter 1 (customer1) and Counter 2 (customer2), closes Counter 2 (verifies Counter 2 Call Next disabled), starts & completes customer2; customer1 opens `/customer/entries/:id` and reloads | Active cards show `Counter 1` / `Counter 2`; Counter 2 closes and still allows Start/Complete on customer2; customer1 sees `"Please proceed to Counter 1."` before and after reload; DB matches | AC-35, AC-36, AC-38, AC-39, AC-42, AC-43 | `e2e/tests/f09-multi-counter.spec.ts` | **passed** (local, 2026-11-27) |
| COUNTER-017 | E2E: operator 409 error feedback and F-08 recovery re-call at different counter | E2E | reset DB; customer1 joins `queue1` | Operator1 calls customer1 at Counter 1, marks no-show, returns to queue, calls at Counter 2; also clicks Call Next when queue is empty (and on a stale-closed counter via API) | After recovery, customer1 is called at Counter 2 and sees `"Please proceed to Counter 2."`; empty counter Call Next shows user-safe `NO_WAITING_ENTRIES` message; stale closed counter shows `COUNTER_CLOSED` message and refreshes | AC-39, AC-41, AC-42, AC-43 | `e2e/tests/f09-multi-counter.spec.ts` | **passed** (local, 2026-11-27) |
| COUNTER-018 | E2E: keyboard-only operation and responsive layout (360 px / 1280 px) | E2E | customer1 joined `queue1` | Operator1 uses Tab/Enter/Space only to toggle Counter 2 closed/open and trigger Counter 1 Call Next; check `scrollWidth <= clientWidth` at `360 × 800` and `1280 × 800` on `/operator/queues/:id` and `/customer/entries/:id` | All controls operable with keyboard alone; zero page-level horizontal overflow on both pages at both widths | AC-42, AC-43 | `e2e/tests/f09-multi-counter.spec.ts` | **passed** (local, 2026-11-27) |
| COUNTER-019 | E2E: zero-usable-counter legacy queue-level UI fallback (`204` neutral empty + Sprint 1 prompt) | E2E | reset DB and remove counters from `queue1` (zero usable counters) | Operator1 opens `/operator/queues/:id`, clicks legacy header **Call Next** on empty queue; then customer1 joins `queue1`, operator1 clicks legacy **Call Next**, and customer1 opens `/customer/entries/:id` | Legacy **Call Next** button renders (with `"No counters configured for this queue."`); empty click hits `POST /api/operator/queues/:id/call-next` returning `204`, displaying neutral `"No waiting entries to call right now."` with zero `role="alert"` (`409`); calling customer1 commits `counterId: null` and renders Sprint 1 `"Please go to the service desk."` with no counter badge | AC-39, AC-42, AC-43, AC-44 | `e2e/tests/f09-multi-counter.spec.ts` | **passed** (local, 2026-11-27) |
| REG-S2-003 | Sprint 1, F-07, and F-08 regression | All | none | `npm run test --workspace=server`, `npm run test --workspace=client`, `npm run test:e2e`, server typecheck + build, client build | All 202 existing server tests and 105 existing client tests pass **unmodified**; 6 existing Playwright E2E specs updated to target `Counter 1` after seeded queues gained default counters while `COUNTER-019` covers the zero-usable-counter legacy queue-level UI fallback (`22/22` E2E passing) | AC-01–AC-34, AC-44 | existing `server/tests/*.test.ts`, `client/src/test/*.test.tsx`, `e2e/tests/*.spec.ts` | **passed** (local, 2026-11-27) |
| PERF-S2-003 | NFR-04 for F-09 | Performance (standalone script) | 1,000 `WAITING` entries in `queue1` with seeded counters (`C1`, `C2` both `OPEN`); PERF-001 method (sequential requests per operation) | 1. `GET /api/operator/queues/:id/counters` (5 warm-ups + 100 timed); 2. `PATCH /api/operator/counters/{C1}/status` alternating `CLOSED`/`OPEN` for an **even** total (6 warm-ups + 100 timed = 106 alternating toggles, ending `OPEN`); **precondition check/reset** verifying both `C1` and `C2` are `OPEN` before Step 3; 3. `POST /api/operator/counters/:id/call-next` (5 warm-ups + 100 timed across `C1`/`C2`, all returning `200`); 4. `GET /api/operator/queues/:id/entries` (with counter join, 5 warm-ups + 100 timed); 5. `GET /api/me/queue-entries/:id` (called entry with `counterName`, 5 warm-ups + 100 timed) | p95 ≤ 500 ms for reads (1, 4, 5) and ≤ 1,000 ms for mutations (2, 3); functional checks assert `C1`/`C2` are `OPEN` entering Step 3, every Step 3 response is `200` (zero `409 COUNTER_CLOSED`) with valid `counterId`/`counterName`, and zero duplicate claims | NFR-04 (AC-35, AC-36, AC-38, AC-44) | `server/tests/nfr/perf-s2-003-multi-counter.ts` (`npm run test:perf:f09 --workspace=server`) | **passed** (local, 2026-11-27, see §8.5) |

### 8.2 Acceptance criteria coverage

| AC | Tests |
|---|---|
| AC-35 | COUNTER-002, COUNTER-016 |
| AC-36 | COUNTER-003, COUNTER-016 |
| AC-37 | COUNTER-001, COUNTER-004, COUNTER-005 |
| AC-38 | COUNTER-006, COUNTER-008, COUNTER-016 |
| AC-39 | COUNTER-001, COUNTER-007, COUNTER-008, COUNTER-009, COUNTER-016, COUNTER-017, COUNTER-019 |
| AC-40 | COUNTER-010, COUNTER-011 |
| AC-41 | COUNTER-012, COUNTER-013, COUNTER-017 |
| AC-42 | COUNTER-014, COUNTER-016, COUNTER-017, COUNTER-018, COUNTER-019 |
| AC-43 | COUNTER-015, COUNTER-016, COUNTER-017, COUNTER-018, COUNTER-019 |
| AC-44 | COUNTER-013, COUNTER-019, PERF-S2-003, REG-S2-003 |

### 8.3 Row invariants asserted after every F-09 API+DB scenario

```sql
-- 1. WAITING and CANCELLED entries must never reference a counter
SELECT id FROM "QueueEntry"
WHERE "status" IN ('WAITING', 'CANCELLED') AND "counterId" IS NOT NULL;
-- expected: zero rows

-- 2. Every assigned counter must belong to the same ServiceQueue as the entry
SELECT e.id
FROM "QueueEntry" e
JOIN "Counter" c ON c.id = e."counterId"
WHERE c."serviceQueueId" <> e."serviceQueueId";
-- expected: zero rows
```

Plus all F-07 (§4) and F-08 (§7.3) row invariants (no two active entries per `(customerId, serviceQueueId)`, no duplicate `(serviceQueueId, queueNumber)`, and valid `CANCELLED`/`NO_SHOW` timestamp/count invariants).

### 8.4 Not planned in F-09

- Firefox and WebKit E2E (optional, `npm run test:e2e:all-browsers`; default run is Chromium).
- Counter create/rename/delete CRUD tests (out of scope for Sprint 2).
- Concurrent-load stress tests beyond the multi-counter Call Next and Call Next vs Close Counter races in `COUNTER-010` and `COUNTER-011`.
- Production Cloud SQL migration, counter-only provisioning, and Cloud Run deploy (handled at release).

### 8.5 Execution results (F-09)

All runs executed locally on `feature/sprint2/42-multi-counter-impl` (2026-11-27) against PostgreSQL 16.15 (Docker, `qms_test_db`), Node v24.14.0, and Chromium. Raw performance output: [evidence/perf-s2-003.txt](./evidence/perf-s2-003.txt). Raw red/green output, re-executed at the red commit `3a63260` and the merged commit `bae2d3d`, and the screenshot captions: [evidence/f09-red-run.txt](./evidence/f09-red-run.txt), [evidence/f09-green-run.txt](./evidence/f09-green-run.txt), [evidence/f09-evidence-notes.md](./evidence/f09-evidence-notes.md). F-09 E2E screenshots: `docs/sprints/sprint-2/evidence/f09-01-*.png` through `f09-04-*.png`.

| Run | Command | Passed | Failed | Skipped |
|---|---|---|---|---|
| Red, server | `npm run test --workspace=server` | 202 (16 existing files) | 12 (+ 1 missing module `f09-counter-rule.test.ts`) | 0 |
| Red, client | `npm run test --workspace=client` | 107 (105 existing + 2 baseline fallback checks) | 13 (`f09-multiCounter.test.tsx`) | 0 |
| Green, server (full) | `npm run test --workspace=server` | 236 (18/18 files: 202 existing unmodified + 22 unit + 12 API+DB/concurrency, including `ON UPDATE RESTRICT` and `provision:counters` → `seed` in `COUNTER-013`) | 0 | 0 |
| Green, client (full) | `npm run test --workspace=client` | 125 (8/8 files: 105 existing unmodified + 20 F-09) | 0 | 0 |
| Green, E2E Chromium (full) | `npm run test:e2e` | 22 (18 existing + 4 F-09: `COUNTER-016`–`COUNTER-019`) | 0 | 0 |
| Green, static, DB & provisioning | `npm run typecheck --workspace=server`, `npm run build --workspace=server`, `npm run build --workspace=client`, clean migration reset on `qms_db` & `qms_test_db` (`pg_constraint`: `confupdtype = 'r'`, `confdeltype = 'r'`), `npm run provision:counters --workspace=server` → `npm run seed --workspace=server` | all exit 0 (`{ queuesScanned: 2, countersCreated: 4 }` then `seed` with zero `P2002`) | 0 | 0 |
| PERF-S2-003 | `npm run test:perf:f09 --workspace=server` | 5 / 5 operations within NFR-04 targets | 0 | 0 |

**Regression note (`REG-S2-003`):** All 202 existing server tests and 105 existing client tests passed **unmodified** (continuing to exercise legacy `POST /api/operator/queues/:queueId/call-next`, including `204 No Content`). Because `seed.ts` now seeds `Counter 1` and `Counter 2` for `General Inquiry Desk` and Contract v1.1–v1.3 hides the legacy header `Call Next` button whenever ≥ 1 usable counter exists, 6 existing Playwright E2E specs (`authorization.spec.ts`, `customer-flow.spec.ts`, `f08-no-show.spec.ts`, `keyboard.spec.ts`, `operator-flow.spec.ts`, `responsive.spec.ts`) were intentionally updated to target `Call next customer to Counter 1` and counter-aware messages without weakening any assertion, and `COUNTER-019` was added to `e2e/tests/f09-multi-counter.spec.ts` to explicitly verify the zero-usable-counter legacy queue-level UI fallback (`204` neutral empty message and Sprint 1 `"Please go to the service desk."`).

**`PERF-S2-003` (NFR-04) measured latencies** ([evidence/perf-s2-003.txt](./evidence/perf-s2-003.txt)):

| Operation | Kind | n | p50 ms | p95 ms | max ms | Target p95 | Result |
|---|---|---:|---:|---:|---:|---:|---|
| `GET /api/operator/queues/:id/counters` | read | 100 | 10.2 | 12.9 | 22.6 | ≤ 500 | PASS |
| `PATCH /api/operator/counters/:id/status` | mutation | 100 | 16.2 | 25.3 | 31.4 | ≤ 1,000 | PASS |
| `POST /api/operator/counters/:id/call-next` | mutation | 100 | 19.1 | 94.6 | 267.2 | ≤ 1,000 | PASS |
| `GET /api/operator/queues/:id/entries` (with counter join) | read | 100 | 69.2 | 103.9 | 218.4 | ≤ 500 | PASS |
| `GET /api/me/queue-entries/:id` (called with `counterName`) | read | 100 | 8.9 | 24.5 | 62.3 | ≤ 500 | PASS |

Not run: Firefox and WebKit E2E; `docker build` on the F-09 branch.
