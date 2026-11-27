# Lab 7 Part A — Impact Analysis: BR-06 Maximum Active Queue Entries Cap

> **Version:** 1.0 | **Date:** 2026-11-27 | **Issue:** #51 (Lab 7 Part A — Contract Update & Impact Analysis)  
> **Branch:** `docs/lab7-part-a-contract` → `lab7-staging`  
> **Accepted Sprint 1 Baseline & Pre-change Commit:** `e304cd9` (`main`)  
> **Pre-change Deployed Cloud Run Revision:** `qms-00005-5kz` (`qms`, `asia-southeast1`)

---

## 1. Approved Change Request Summary (BR-06)

- **Old Rule (`BR-06` v1.0):** A customer may hold active queue entries in any number of distinct queues simultaneously (only duplicate active entries in the same queue are prevented under `BR-05`).
- **New Rule (`BR-06` v1.1):** A customer may hold **at most 2 active queue entries** (`WAITING`, `CALLED`, or `SERVING`) across all queues simultaneously. Attempting to join a 3rd `OPEN` queue while holding 2 active entries must be rejected with HTTP `409 Conflict` (`MAX_ACTIVE_ENTRIES_REACHED`).
- **Acceptance Criteria (`CR51-AC1`–`CR51-AC4`):**
  - **CR51-AC1:** Customer with 0 or 1 active entry can join an `OPEN` queue (`201 Created`).
  - **CR51-AC2:** Customer with 2 active entries attempting to join a 3rd `OPEN` queue is rejected with `409 Conflict` (`MAX_ACTIVE_ENTRIES_REACHED`); no entry persisted and `lastQueueNumber` unchanged.
  - **CR51-AC3:** After one active entry becomes `COMPLETED` (and forward-compatibly `CANCELLED`/`NO_SHOW` once implemented), customer can join a new `OPEN` queue (`201 Created`).
  - **CR51-AC4:** Duplicate active entry in the same queue is still rejected with `409 DUPLICATE_ACTIVE_ENTRY`.

---

## 2. Impact Analysis Table

| Requirement ID | Feature | Affected Contract Sections (SRS / Feature SDS / System-Level SDS / API & UI Specs) | Acceptance Criteria | STS Test IDs (Planned / Updated) | Code Modules (Lab 7 Part B Scope) |
|---|---|---|---|---|---|
| **BR-06**, **FR-12**, **AD-06** | **F-04** (Customer queue join and own-state retrieval) & **F-03** (Queue catalog and number allocation) | **SRS** (`docs/srs.md` v1.1): §4 (`FR-12`), §5 (`BR-06`), §7 (Error Summary), §8 (`AD-06`), §10 (Rev History)<br>**Feature SDS** (`docs/features/sprint-1-core-queue.md` v1.1): Business Logic, Validation & Error Handling, Rev History<br>**System-Level SDS** (`docs/system-sds.md` v1.1): §2 (Role Matrix), §4.1 (Per-customer `User` `FOR NO KEY UPDATE` → `ServiceQueue` `FOR UPDATE` lock & cap check), §§5.3–5.4 (Error Codes), §13 (Rev History)<br>**API Spec** (`docs/sprints/sprint-1/api-spec.md` v1.1): §2 (Error Contract), §7.2 (`POST /api/queues/{queueId}/entries`), §9 (Integrity Rules), §11 (Rev History)<br>**UI Spec** (`docs/sprints/sprint-1/ui-spec.md` v1.1): §4 (Interaction Rules), §7 (Error States), §11 (Rev History)<br>**Traceability** (`docs/traceability.md` v1.1): `FR-12`, `BR-06`, Approved Changes | **CR51-AC1** (0–1 active → `201`)<br>**CR51-AC2** (2 active + 3rd queue → `409 MAX_ACTIVE_ENTRIES_REACHED`, no DB write)<br>**CR51-AC3** (1 entry → `COMPLETED`/terminal → join new queue `201`)<br>**CR51-AC4** (same-queue duplicate → `409 DUPLICATE_ACTIVE_ENTRY`) | **Updated:** `QUEUE-008` (`CR51-AC1`, re-verify in Part B)<br>**New:** `QUEUE-009` (`CR51-AC2`), `QUEUE-010` (`CR51-AC3`), `QUEUE-011` (`CR51-AC4`), `CONCURRENCY-005` (`CR51-AC1`/`CR51-AC2` race), `UI-002` (`CR51-AC2` UI)<br>**Preserved:** `QUEUE-002`, `QUEUE-003`, `QUEUE-005`, `CONCURRENCY-002` (`docs/sprints/sprint-1/tests.md` v1.1 §§2, 14) | **Backend:**<br>- `server/src/errors/AppError.ts` (add `'MAX_ACTIVE_ENTRIES_REACHED'` to `ErrorCode` union)<br>- `server/src/services/queueService.ts` (`joinQueue`: add `User` `FOR NO KEY UPDATE` lock before `ServiceQueue` `FOR UPDATE` lock, preserve same-queue `DUPLICATE_ACTIVE_ENTRY` check first, then count active entries across all queues `>= 2` → throw `409 MAX_ACTIVE_ENTRIES_REACHED`)<br>- `server/src/routes/queues.ts` (verify pass-through of `AppError` to `errorHandler`; no route signature change)<br>**Frontend:**<br>- `client/src/components/customer/AvailableQueues.tsx` (add `JOIN_ERROR_TEXT.MAX_ACTIVE_ENTRIES_REACHED` and branch in `describeJoinFailure` for `409 MAX_ACTIVE_ENTRIES_REACHED`) |

---

## 3. Impact Checklist

| Dimension | Impacted? | Analysis / Rationale |
|---|---|---|
| **Callers & Dependencies** | **Yes (minimal)** | The sole caller of `joinQueue` is `POST /api/queues/:queueId/entries` (`server/src/routes/queues.ts`), invoked by `client/src/api/queues.ts` → `AvailableQueues.tsx`. Route path, HTTP method, request headers (`Cookie`, `X-CSRF-Token`), and `201 Created` response schema are **unchanged**. Only the error envelope gains one new `409` error code (`MAX_ACTIVE_ENTRIES_REACHED`). Operator endpoints (`operatorService.ts`, `routes/operator.ts`) and read endpoints (`GET /api/queues`, `GET /api/me/queue-entries*`) are unaffected. |
| **API & UI Validation** | **Yes** | **Backend:** `joinQueue` validates in strict precedence order inside one transaction: queue exists (`404`) → queue `OPEN` (`409 QUEUE_NOT_AVAILABLE`) → no active entry in same queue (`409 DUPLICATE_ACTIVE_ENTRY`, `CR51-AC4`) → active entries across all queues `< 2` (`409 MAX_ACTIVE_ENTRIES_REACHED`, `CR51-AC2`). `AppError.ts` adds `'MAX_ACTIVE_ENTRIES_REACHED'` to `ErrorCode`.<br>**Frontend:** `AvailableQueues.tsx` maps `409 MAX_ACTIVE_ENTRIES_REACHED` to safe copy (`"You can hold at most 2 active queue entries at the same time."`) instead of falling back to the generic error string; buttons stay enabled and no server message is rendered. |
| **Roles & Ownership** | **No (N/A — unchanged)** | `POST /api/queues/:queueId/entries` remains restricted to `Role.CUSTOMER` with valid session (`requireAuth`) and CSRF token (`requireCsrf`). The active-entry count is strictly scoped to `customerId = req.user.id`; operators, cross-owner privacy (`404`), and queue assignments (`403`) are untouched. |
| **Persistence & Concurrency** | **Yes** | Counting active entries across *distinct* queues introduces a cross-queue TOCTOU race if only the target `ServiceQueue` row is locked (e.g., Customer `C` with 1 active entry in `Q1` concurrently joins `Q2` and `Q3`). Per `system-sds.md §4.1`, `joinQueue` must acquire a per-customer lock (`SELECT id FROM "User" WHERE id = $customerId::uuid FOR NO KEY UPDATE`) *before* locking `ServiceQueue` (`User` → `ServiceQueue` global lock order prevents deadlocks). Using `FOR NO KEY UPDATE` serializes concurrent joins by the same customer without conflicting with PostgreSQL `FOR KEY SHARE` locks taken by FK inserts (such as `Session` rows during login). On `409 MAX_ACTIVE_ENTRIES_REACHED`, the transaction aborts before incrementing `lastQueueNumber`, preserving zero counter leakage (`NUMBER-002`). |
| **Historical Data** | **No (N/A — preserved)** | Terminal records (`COMPLETED`) are preserved and excluded from the active-entry filter `status IN ('WAITING', 'CALLED', 'SERVING')`. Any pre-existing customer who hypothetically held `> 2` active entries prior to rollout will not have existing entries deleted or mutated; they are simply prevented from joining additional queues until their active count drops below `2`. |
| **Database Migrations** | **No (N/A — no migration needed)** | No table, column, enum, or constraint change is required. `QueueEntry` already has index `QueueEntry_customer_joinedAt_idx` (`"customerId", "joinedAt" DESC`) to support fast customer-scoped lookups, and `QueueEntry_active_customer_queue_uidx` remains intact for `BR-05`. Note: `CANCELLED` and `NO_SHOW` are deferred Sprint 2 statuses (F-07/F-08) not present in `QueueStatus`; filtering active rows via `status IN ('WAITING', 'CALLED', 'SERVING')` is automatically forward-compatible with those future terminal states without altering the Prisma schema now. |

---

## 4. Preserved Existing Behavior & Regression Protection

Every existing Sprint 1 capability outside the 3rd-queue cap remains unchanged and is guarded by the existing automated regression suite:

| Preserved Behavior | Requirement / Rule | Existing Automated Regression Tests Protecting It |
|---|---|---|
| Customer joins an `OPEN` queue with 0 or 1 active entry (`201 Created`, monotonic `queueNumber`, `WAITING`) | `FR-05`, `FR-06`, `BR-02`, `BR-03`, `BR-06` (`CR51-AC1`) | `server/tests/queue-registration.test.ts` (`QUEUE-002`, `QUEUE-008`, `NUMBER-001`, `NUMBER-002`, `CONCURRENCY-001`); `e2e/tests/customer-flow.spec.ts` (`FLOW-009`) |
| Same-queue duplicate active join rejected with `409 DUPLICATE_ACTIVE_ENTRY` (including while `CALLED` or `SERVING` and under concurrency) | `FR-12`, `BR-05`, `AD-06` (`CR51-AC4`) | `server/tests/queue-registration.test.ts` (`QUEUE-003`, `CONCURRENCY-002`); `server/tests/foundation.test.ts` (partial unique index `QueueEntry_active_customer_queue_uidx`); `server/tests/integration-sprint1.test.ts`; `client/src/test/customer.test.tsx`; `e2e/tests/customer-flow.spec.ts` (S2) |
| Rejoin after `COMPLETED` succeeds with next monotonic `queueNumber` | `BR-04`, `BR-05` | `server/tests/queue-registration.test.ts` (`QUEUE-005`); `server/tests/foundation.test.ts` (`QUEUE-005`) |
| Closed queue join rejected with `409 QUEUE_NOT_AVAILABLE` without counter increment | `FR-04`, `FR-12`, `BR-08` | `server/tests/queue-registration.test.ts` (`QUEUE-004`); `server/tests/integration-sprint1.test.ts`; `client/src/test/customer.test.tsx` |
| Auth, RBAC, CSRF enforcement, and cross-owner `404` privacy masking | `FR-01`–`FR-03`, `FR-07`, `BR-07`, `NFR-01`, `NFR-02` | `server/tests/auth.test.ts`, `server/tests/csrf.test.ts`, `server/tests/join-csrf.test.ts` (`SEC-002`), `server/tests/rbac-middleware.test.ts`, `server/tests/integration-sprint1.test.ts` (`RBAC-001`–`RBAC-005`), `e2e/tests/authorization.spec.ts` |
| Operator FIFO listing and `WAITING -> CALLED -> SERVING -> COMPLETED` lifecycle & concurrency | `FR-08`–`FR-11`, `BR-01`, `BR-09`–`BR-12` | `server/tests/operator-workflow.test.ts` (`QUEUE-007`, `FLOW-001`–`FLOW-007`, `CONCURRENCY-003`, `CONCURRENCY-004`); `client/src/test/operator.test.tsx`; `e2e/tests/operator-flow.spec.ts` (`FLOW-010`) |
| Health check & single-origin production static serving | Lab 5 Issue #17 | `server/tests/health.test.ts`, `server/tests/static-client.test.ts` |
| Local performance (`PERF-001`), crash durability (`REL-001`), and responsive layouts (`UI-001`) | `NFR-04`, `NFR-05`, `NFR-06` | `server/tests/nfr/perf-001.ts`, `server/tests/nfr/rel-001.ts`, `e2e/tests/responsive.spec.ts` |
