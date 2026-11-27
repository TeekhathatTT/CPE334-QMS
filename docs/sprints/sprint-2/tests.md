# Sprint 2 Test Specification

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-27 | F-07 contract v1: planned tests CANCEL-001 – CANCEL-020 and REG-S2-001. Nothing has been run yet. |

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
| CANCEL-001 | Cancellable-state rule | Unit | none | `isCustomerCancellable(status)` for each of the five statuses | `true` only for `WAITING`; `false` for `CALLED`, `SERVING`, `COMPLETED`, `CANCELLED` | AC-18 | `server/tests/f07-cancel-rule.test.ts` | planned |
| CANCEL-002 | Owner cancels own WAITING entry | API+DB | customer1 joins General Inquiry Desk (entry E, number N) | `POST /api/me/queue-entries/E/cancel` with session + CSRF | `200`; body `entry.status = CANCELLED`, `cancelledAt` is an RFC 3339 UTC string ending in `Z` and not before `joinedAt`, `aheadCount = 0`, `queueNumber = N`, `calledAt`/`serviceStartedAt`/`completedAt` `null`; DB row re-read on a fresh query has the same status and `cancelledAt`; row count for customer1 unchanged (row not deleted) | AC-17 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-003 | Cancel rejected in every non-WAITING state | API+DB | customer1 entries driven to `CALLED`, `SERVING`, `COMPLETED` (via operator1) and `CANCELLED` (via a first cancel) | cancel each one | each `409 INVALID_STATE_TRANSITION`; each row unchanged | AC-18 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-004 | Non-owner customer gets 404 | API+DB | customer1 `WAITING` entry E | customer2 cancels E | `404 RESOURCE_NOT_FOUND`; body equal (except `requestId`) to the body for an unknown UUID; E unchanged (`WAITING`, `cancelledAt` `NULL`) | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-005 | Operator gets 403 | API+DB | customer1 `WAITING` entry E | operator1 (assigned) and operator2 (unassigned) cancel E with valid CSRF | both `403 FORBIDDEN`; E unchanged | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-006 | No session gets 401 | API+DB | customer1 `WAITING` entry E | cancel E with no cookie; and with a logged-out session cookie | both `401 UNAUTHORIZED`; E unchanged | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-007 | CSRF enforced | API+DB | customer1 `WAITING` entry E | customer1 cancels E with no `X-CSRF-Token`; with a wrong token | both `403 FORBIDDEN`; E unchanged | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-008 | Malformed and unknown ids | API+DB | customer1 signed in | cancel `not-a-uuid`, a UUIDv1-shaped id, and a valid but unknown UUIDv4 | `400 INVALID_ARGUMENT`, `400 INVALID_ARGUMENT`, `404 RESOURCE_NOT_FOUND`; no row changed | AC-19 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-009 | Cancel allowed on a CLOSED queue | API+DB | customer1 joins General Inquiry Desk; the queue is then set to `CLOSED` in the DB | cancel the entry | `200`, `CANCELLED` | AC-20 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-010 | Rejoin after cancel gets a new, larger number | API+DB | customer1 joins (number N), cancels | customer1 joins the same queue again | `201`, new entry `WAITING` with number > N and a different id; the cancelled row still exists with number N; `lastQueueNumber` did not move backwards | AC-21 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-011 | Active-entry guard still holds | API+DB | after CANCEL-010's rejoin (one `CANCELLED`, one `WAITING`) | (a) customer1 joins again via API; (b) direct DB insert of a second `WAITING` row for the same customer and queue; (c) read the index definition from `pg_indexes` | (a) `409 DUPLICATE_ACTIVE_ENTRY`; (b) unique violation (`P2002`); (c) predicate still lists exactly `WAITING`, `CALLED`, `SERVING` | AC-21 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-012 | Cancelled entry skipped by Call Next; FIFO kept; hidden from operator | API+DB (cross-feature F-05) | WAITING entries in FIFO order: A (customer1), B (customer2), C (a third CUSTOMER user created by the test with the same seed hash, joined through the API) | read C's `aheadCount`; B cancels; read C's `aheadCount` again; operator1 lists entries; operator1 calls next twice | C's `aheadCount` goes from 2 to 1; operator list does not contain B and keeps A, C in FIFO order; first call returns A, second returns C; B stays `CANCELLED` with `calledAt` `NULL` | AC-22 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-013 | Call Next on a queue whose only entry was cancelled | API+DB | customer1 joins and cancels; no other entries | operator1 calls next | `204` with an empty body; the cancelled row unchanged | AC-22 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-014 | Race: cancel vs Call Next on the same entry | API+DB concurrency | per round: reset, customer1 joins (only entry) | fire `cancel` and `call-next` in parallel (`Promise.all`), 15 rounds | every round: exactly one of {cancel `200` and row `CANCELLED` with `calledAt` `NULL` and call-next `204`} or {call-next `200` with this entry, row `CALLED` with `cancelledAt` `NULL`, cancel `409` with code `INVALID_STATE_TRANSITION` or `CONCURRENT_MODIFICATION`}; never two successes on this entry; row invariant holds; no extra rows | AC-23 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-015 | Own-entry reads keep cancelled history | API+DB | customer1 joins and cancels E, then rejoins (F) | `GET /api/me/queue-entries`; `GET /api/me/queue-entries/E` | list contains both E (`CANCELLED`, `cancelledAt` set) and F (`WAITING`, `cancelledAt` `null`) newest first; detail of E returns `CANCELLED`, `aheadCount 0` | AC-17 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| CANCEL-016 | Leave queue control (component) | Client | mocked API returning entries in each status | render `EntryDetailPage`; open/close confirmation with mouse and `Escape`; confirm; mocked `200`, `409`, `404`, `403`, `500`; double click while busy | button only for `WAITING`; no request until confirmed; "Leaving queue..." and disabled while pending; exactly one `POST` for a double click; success shows "Cancelled", "You left this queue." and "Cancelled:" time; each error shows the §3.3 message; focus moves as specified | AC-24 | `client/src/test/f07-leaveQueue.test.tsx` | planned |
| CANCEL-017 | E2E: join, cancel with confirmation, reload, rejoin | E2E | reset DB | customer1 joins via UI, opens details, Leave queue → Keep my place (no change in DB) → Leave queue → Yes, leave queue; reload; back to queues; join again | after confirm: badge "Cancelled", "Cancelled:" time equal to DB `cancelledAt`; same after reload; DB row `CANCELLED`; rejoin shows a larger queue number | AC-17, AC-21, AC-24 | `e2e/tests/f07-cancellation.spec.ts` | planned |
| CANCEL-018 | E2E: no Leave queue button after operator calls | E2E | customer1 joined; detail page open showing Leave queue | operator1 calls next through the API; wait for the 10 s poll (or Refresh) | badge "Called"; no Leave queue button; a direct API cancel by customer1 returns `409` | AC-18, AC-24 | `e2e/tests/f07-cancellation.spec.ts` | planned |
| CANCEL-019 | E2E: keyboard only and responsive | E2E | customer1 joined | keyboard-only: Tab to Leave queue, Enter, Escape, Enter, Tab to Yes, Enter; then at 360 × 800 and 1280 × 800 with the confirmation panel open | cancellation completes with the keyboard alone; no page-level horizontal overflow at either width | AC-24 | `e2e/tests/f07-cancellation.spec.ts` | planned |
| CANCEL-020 | Race: two cancels of the same entry | API+DB concurrency | customer1 `WAITING` entry, 10 rounds | two parallel cancels by customer1 | exactly one `200` and one `409` (`INVALID_STATE_TRANSITION` or `CONCURRENT_MODIFICATION`) per round; one `cancelledAt` value | AC-23 | `server/tests/f07-customer-cancellation.test.ts` | planned |
| REG-S2-001 | Sprint 1 regression unchanged | All | none | `npm run test`, `npm run test:client`, `npm run test:e2e`, server and client typecheck | all Sprint 1 tests pass with no Sprint 1 test file edited | AC-01–AC-16 | existing `server/tests/*.test.ts`, `client/src/test/*.test.tsx`, `e2e/tests/*.spec.ts` | planned |

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

- PERF-001 is not extended to the cancel mutation (NFR-04 is not re-measured for it).
- Firefox and WebKit E2E runs are optional (`npm run test:e2e:all-browsers`); the default run is Chromium.
- Production database migration and release deploy are outside this feature's verification.

## 6. Execution results

None yet. Red and green runs will be recorded here with commit SHAs and counts, and the raw output saved to `evidence/f07-red-run.txt` and `evidence/f07-green-run.txt`.
