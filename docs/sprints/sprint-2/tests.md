# Sprint 2 Test Specification

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-27 | F-07 contract v1: planned tests CANCEL-001 – CANCEL-020 and REG-S2-001. Nothing has been run yet. |
| 1.1 | 2026-11-27 | Red and green runs executed; status column and §6 updated with actual results. Test definitions unchanged. |
| 1.2 | 2026-11-27 | Adds PERF-S2-001 (NFR-04 for the cancel mutation and the operations F-07 changed) after PR #56 review. §5 first bullet revised (old text kept in §5). CANCEL-001 – CANCEL-020 unchanged. |

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
