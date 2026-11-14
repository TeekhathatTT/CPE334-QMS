# Issue #7 — Coverage and Gap Analysis

This table maps each Issue #7 scope item to the tests that already existed on `sprint1-staging` (`68d818f`) and to the tests Issue #7 adds. New tests were added only where the existing suites left a gap. Results are in [`../tests.md` §13](../tests.md#13-execution-evidence-and-automated-test-results-issue-7-integration-authorization--e2e).

New test files:
- Server: `server/tests/integration-sprint1.test.ts` (9 tests, real HTTP + real PostgreSQL)
- Client: `client/src/test/integration-guards.test.tsx` (6 tests, jsdom)
- Browser: `e2e/tests/*.spec.ts` (12 Playwright tests × Chromium, Firefox, WebKit)
- NFR: `server/tests/nfr/perf-001.ts` (PERF-001) and `server/tests/nfr/rel-001.ts` (REL-001), standalone scripts outside `npm test`

| # | Issue #7 scope item | Already covered before #7 (test IDs / files) | Gap found | Added in #7 |
|---|---|---|---|---|
| 1 | Customer and Operator workflow testing | API: QUEUE-001/002/006, FLOW-001–007 (`queue-registration`, `operator-workflow`). jsdom: `customer`, `entryDetail`, `operator` component tests. Customer screens checked once by hand in a browser (§11). | No automated browser run of either workflow (FLOW-009, FLOW-010 Pending). The API tests set up state with Prisma inserts, so no single test drove customer and operator through the API one after the other. | E2E **S1** (FLOW-009), **S4** (FLOW-010), **S5** (customer sees operator changes through polling). Server §3: full cross-role flow using only API calls. |
| 2a | FIFO | QUEUE-007, FLOW-001, CONCURRENCY-003 | FIFO after a rejoin, and FIFO for the WAITING entries left after a race, were not checked | Server §3 (rejoin keeps FIFO), §4 (drain after race is FIFO). E2E **S3** (operator list order in the browser). |
| 2b | Uniqueness / numbering | NUMBER-001/002, CONCURRENCY-001 | No SQL-level check after mixed workloads | Server §4 `assertDbInvariants` (no duplicate `(serviceQueueId, queueNumber)`, counter ≥ max number) |
| 2c | Duplicate prevention | QUEUE-003, CONCURRENCY-002 (one customer) | Several customers racing duplicate joins at once; duplicate attempts while the entry is CALLED or SERVING through the API | Server §4 multi-customer duplicate race; §3 duplicate at CALLED/SERVING. E2E **S2** (duplicate in the UI, DB count). |
| 2d | Ownership | QUEUE-006, RBAC-005 (API); entryDetail jsdom 404 | Browser check that no data leaks on the not-found screen | E2E **S8**. Server §1 (cross-owner 404 both directions, no customer id in body). |
| 2e | State transitions | FLOW-004–007 (Prisma-seeded fixtures) | Out-of-order checks at every stage of one real API lifecycle; timestamp order; RFC 3339 `Z` | Server §3 |
| 2f | Concurrency | CONCURRENCY-001–004 (each alone) | Joins racing call-next; start/complete storms across several entries; no SQL invariant checks after any race | Server §4 (3 tests, each followed by `assertDbInvariants`) |
| 3 | Authorization: Customer, Operator, unauthenticated | RBAC-001–005; AUTH-003/005 on `/api/auth/me` only; `rbac-middleware` | Expired, tampered and logged-out sessions had been tested only on `/api/auth/me`. There was no full matrix covering all 11 endpoints. | Server §1: all 11 protected endpoints × {anonymous, anonymous + forged CSRF, expired, tampered, logged-out} → 401. Role and assignment table (22 rejections, exact code, DB snapshot unchanged). Assigned-operator success for each mutation. Logged-out reuse. E2E **S6**, **S7**. Client: session expiry on operator screens. |
| 3b | CSRF | SEC-002: join (all variants), operator mutations (missing token only), logout (wrong/other) | Wrong, empty, and another session's token on call-next / start / complete; closed-queue join | Server §2: 6 mutations × 4 bad-token variants → 403, DB and sessions unchanged |
| 4 | API integration | All server suites | Covered by items 1–3 above | — |
| 5 | E2E automated tests (8 scenarios) | none (no Playwright before #7) | All | E2E **S1–S8**, plus **S9** (UI-001), which is an extra item and **not** one of the eight issue scenarios |
| 6 | Regression (backend, frontend, integration, E2E) | Server 109, client 71 (Step 0 baseline, this session) | — | Full re-run recorded in tests.md §13: server 118, client 77, E2E 34 passed + 2 skipped across 3 browsers (twice), PERF-001 and REL-001 passed |
| 7 | Test evidence including screenshots | Customer-screen notes in tests.md §11 (no image files) | No screenshots in the repo | 32 PNGs + `e2e-run.txt`, `perf-001.txt`, `rel-001.txt` in this folder (see [README.md](./README.md)) |

## E2E scenario map

| Scenario | Issue #7 item | Test (file › title) | Test IDs |
|---|---|---|---|
| S1 | Customer login, join, view | `customer-flow.spec.ts` › S1 / FLOW-009 | FLOW-009, QUEUE-001, QUEUE-002 |
| S2 | Duplicate join rejected | `customer-flow.spec.ts` › S2 | QUEUE-003 |
| S3 | Operator login and queue view | `operator-flow.spec.ts` › S3 | QUEUE-007, RBAC-004 |
| S4 | Operator lifecycle | `operator-flow.spec.ts` › S4 / FLOW-010 | FLOW-010, FLOW-002/004/006, FLOW-003 |
| S5 | Customer sees operator's change | `customer-flow.spec.ts` › S5 (real 10 s polling, no reload) | FLOW-009/010 |
| S6 | Customer blocked from operator screens (and the reverse) | `authorization.spec.ts` › S6 | RBAC-001–004 (UI) |
| S7 | Unauthenticated access; session expired mid-use | `authorization.spec.ts` › S7 | AUTH-003, AUTH-005 (UI) |
| S8 | Cross-customer access | `authorization.spec.ts` › S8 | QUEUE-006, RBAC-005 |
| S9 (extra) | Responsive at 360 / 1280 px | `responsive.spec.ts` › S9 / UI-001 (×2 viewports) | UI-001 |
| Extra | Keyboard-only walkthrough, customer and operator | `keyboard.spec.ts` (skipped in WebKit, reason in the test) | ui-spec §8.1 |

All specs run in Chromium, Firefox and WebKit (`npm run test:e2e:all-browsers`).

## NFR checks added after review

| Test ID | Method | File |
|---|---|---|
| PERF-001 | 1,000-entry dataset, 5 warm-ups + 100 timed sequential requests per operation, p95 against NFR-04 targets | `server/tests/nfr/perf-001.ts` |
| REL-001 | Row visible on a separate connection after each 2xx; SIGKILL the API and PostgreSQL, WAL recovery, identical data afterwards | `server/tests/nfr/rel-001.ts` |

## Deliberately not duplicated

- Malformed UUID → 400 (API-001), aheadCount rules, NUMBER-002 rollback, seed idempotency, config/DB-isolation guards, and the CONCURRENCY-003/004 races as originally written. These already pass and were re-run without changes.
- Client: login form validation, join error mapping, polling timers, operator button states and 409 handling. The existing jsdom suites already assert them.
