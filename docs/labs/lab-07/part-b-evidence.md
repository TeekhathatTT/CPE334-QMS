# Lab 7 Part B — Test-First Implementation Evidence: BR-06 Active Entry Cap

> **Issue:** #52 (Lab 7 Part B) | **Depends on:** #51 (Part A contract, PR #57)
> **Branch:** `maintenance/lab7/52-max-active-entries` → `lab7-staging`
> **Contract:** `docs/labs/lab-07/impact-analysis.md`, `docs/system-sds.md` §4.1, `docs/sprints/sprint-1/api-spec.md` §7.2, `docs/sprints/sprint-1/tests.md` §14

## 1. Version Table

| Stage | Reference | Notes |
|---|---|---|
| Sprint 1 baseline | `e304cd9` (`main`), Cloud Run revision `qms-00005-5kz` | Accepted Sprint 1 release |
| Pre-change commit | `aa1c0fa` (`lab7-staging`, merge of PR #57) | Contract v1.1 only; `server/` and `client/` are byte-identical to `e304cd9` (`git diff --quiet e304cd9 aa1c0fa -- server client`) |
| Test commit | `2664740` | Failing BR-06 tests + red evidence |
| Implementation commit | `bfa2464` | Service, error code and UI mapping |
| `lab7-staging` merge | _pending (PR review)_ | |
| `main` release | _pending_ | |
| Deployed Cloud Run revision | _pending_ | |

Commit order: contract (`05fb34a`, `fe29255`, merged as `aa1c0fa`) → tests (`2664740`) → implementation (`bfa2464`).

## 2. Red on the Old Code

Tests were added on top of `aa1c0fa` and run before any implementation change.

| Suite | Command | Result | Evidence |
|---|---|---|---|
| Server | `cd server && npx vitest run tests/queue-registration.test.ts` | 6 failed / 26 passed (32) | `evidence/red-server.txt` |
| Client | `cd client && npx vitest run src/test/customer.test.tsx` | 1 failed / 26 passed (27) | `evidence/red-client.txt` |

Every failure is an assertion on the missing behavior; nothing failed to compile and no fixture broke:

| Test | Failure on old code | Why it proves the missing rule |
|---|---|---|
| QUEUE-009 ×3 (WAITING+WAITING, CALLED+WAITING, SERVING+CALLED) | `expected 201 to be 409` | 3rd-queue join was accepted |
| QUEUE-009 boundary (per-customer cap) | `expected 201 to be 409` | CUSTOMER1's 3rd join was accepted |
| QUEUE-010 | `expected 201 to be 409` | Precondition step (blocked at cap) was never blocked |
| CONCURRENCY-005 | `expected [201, 201] to deeply equal [201, 409]` | Both racing joins succeeded → 3 active entries |
| UI-002 | alert did not contain the cap text | `MAX_ACTIVE_ENTRIES_REACHED` fell back to the generic message |

QUEUE-008 (CR51-AC1) and QUEUE-011 (CR51-AC4) passed on the old code as expected: they protect behavior that must not change.

## 3. Green

### 3.1 Code change (`bfa2464`, full diff in `evidence/implementation.diff`)

- `server/src/errors/AppError.ts`: adds `MAX_ACTIVE_ENTRIES_REACHED` to `ErrorCode`.
- `server/src/services/queueService.ts` `joinQueue`, inside the existing transaction:
  1. `SELECT id FROM "User" WHERE id = $customerId::uuid FOR NO KEY UPDATE` (new per-customer lock; lock order User → ServiceQueue).
  2. Existing `ServiceQueue ... FOR UPDATE`, 404 and `QUEUE_NOT_AVAILABLE` checks (unchanged).
  3. Existing same-queue `DUPLICATE_ACTIVE_ENTRY` check (unchanged, still first → CR51-AC4).
  4. New: count of the customer's `WAITING`/`CALLED`/`SERVING` entries across all queues; `>= 2` → `409 MAX_ACTIVE_ENTRIES_REACHED`, before `lastQueueNumber` is incremented.
- `client/src/components/customer/AvailableQueues.tsx`: maps `409 MAX_ACTIVE_ENTRIES_REACHED` to "You can hold at most 2 active queue entries at the same time." (no queue re-fetch; server message never shown).
- No route, schema or migration change.

### 3.2 Same tests, after the change

| Suite | Result | Evidence |
|---|---|---|
| Server `tests/queue-registration.test.ts` | 32 passed (32) | `evidence/green-server.txt` |
| Client `src/test/customer.test.tsx` | 27 passed (27) | `evidence/green-client.txt` |
| CONCURRENCY-005 repeated 5× | 5/5 passed | `evidence/concurrency-005-repeat.txt` |

### 3.3 Setup and assertions

All server cases run against the real PostgreSQL test database (`qms_test_db`), reset and re-seeded before each test; requests go through the full Express app with real session cookies and `X-CSRF-Token`.

| Test | Setup | Assertions |
|---|---|---|
| QUEUE-008 | 2 OPEN queues; join Q1 then Q2 | both `201`; 2 `WAITING` rows |
| QUEUE-009 (×3) | Q1, Q2 entries seeded directly with each active-status pair; empty Q3 | `409 MAX_ACTIVE_ENTRIES_REACHED`, no `data`, UUID `requestId`; Q3 `lastQueueNumber = 0`, 0 rows in Q3, total row count unchanged, still 2 active |
| QUEUE-009 boundary | CUSTOMER1 at cap | CUSTOMER2 joins Q3 → `201`, `queueNumber 1` (cap is per customer) |
| QUEUE-010 | join Q1, Q2; Q3 blocked (`409`); Q1 entry → `COMPLETED` | Q3 join `201`, `WAITING`, `queueNumber 1`; Q3 counter `1`; 2 active; COMPLETED row kept |
| QUEUE-011 | join Q1, Q2; re-join Q1 | `409 DUPLICATE_ACTIVE_ENTRY` (not the cap code); Q1 counter still `1`; row count unchanged |
| CONCURRENCY-005 | 1 active in Q1; `Promise.all` joins to Q2 and Q3 | statuses `[201, 409]`; winner `queueNumber 1`; loser code `MAX_ACTIVE_ENTRIES_REACHED`; 2 active; loser queue counter `0` with 0 rows |
| UI-002 | mocked `409 MAX_ACTIVE_ENTRIES_REACHED` with an internal message | alert shows the cap text; internal text absent; both Join buttons enabled; stays on `/customer`; no queue re-fetch |

## 4. Regression

Environment: Node v22.20.0, vitest 2.1.9, Playwright (chromium) per `evidence/regression-e2e.txt`, PostgreSQL 16.15 (Docker `qms-postgres`), Windows 11.

| Suite | Command | Pass / Fail / Skip | Why it is relevant |
|---|---|---|---|
| Server, all 12 files | `cd server && npx vitest run` | 147 / 0 / 0 | Domain rules (`queue-registration`, `operator-workflow`, `foundation`: numbering, BR-05 index, lifecycle), persistence/rollback (`NUMBER-002`, `CONCURRENCY-001/002/003/004`), access and ownership (`auth`, `rbac-middleware`, `csrf`, `join-csrf`, `integration-sprint1` RBAC-001–005, cross-owner 404) |
| Client, all 5 files | `cd client && npx vitest run` | 78 / 0 / 0 | Existing join error mappings (`DUPLICATE_ACTIVE_ENTRY`, `QUEUE_NOT_AVAILABLE`, 404, 403, 500), route guards and operator screens share the changed component tree |
| E2E (chromium) | `npm run test:e2e` | 12 / 0 / 0 | End-to-end customer join (FLOW-009), duplicate rejection (S2), operator lifecycle (FLOW-010), authorization (S6–S8), keyboard and responsive layouts |

Evidence: `evidence/regression-server.txt`, `evidence/regression-client.txt`, `evidence/regression-e2e.txt`.

No existing test was weakened, deleted or disabled. The only changed expectation is QUEUE-008's title and scope: it now states the 0–1 active entry boundary of CR51-AC1 instead of "any number of distinct queues"; its assertions (2 joins succeed, 2 active rows) are unchanged and still hold under BR-06 v1.1 (STS v1.2).

Note: `npm run test:e2e` rewrites the Sprint 1 screenshots and `e2e-run.txt` under `docs/sprints/sprint-1/evidence/`; those were restored with `git restore` so the Sprint 1 record is unchanged.

## 5. Still To Do (tracked in #52)

- PR into `lab7-staging` with review by @Khwanklao and passing CI.
- Release PR into `main`, deploy via the Lab 5 pipeline (start Cloud SQL first), record the release commit and Cloud Run revision in §1.
- Post-deployment checks: 3rd-queue join returns `409 MAX_ACTIVE_ENTRIES_REACHED` on the deployed URL, plus one preserved Sprint 1 path (e.g. cross-customer entry lookup returns `404`).
