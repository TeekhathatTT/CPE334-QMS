# Feature SDS: F-10 Priority Queue Policy

| Item | Value |
|---|---|
| Feature | F-10 Priority queue policy |
| Sprint | 2 (Deliverable 2, Part B) |
| Issue | #43 |
| Depends on | F-03 (queues & number allocation), F-05 (operator lifecycle); interacts with F-04 (customer join & reads), F-07 (cancellation), F-08 (no-show recovery), and F-09 (multi-counter support) |
| Contract version | v1.2 (2026-11-28; Contract v1.1 merged at `4b93e72`, PR #67) |
| Status | Implemented and verified locally on `feature/sprint2/43-priority-queue-policy-impl` (RED `c99236b`, GREEN `a286f9b`; pending PR review by `@TeekhathatTT` and release) |
| Author / reviewer | `@Khwanklao` / `@TeekhathatTT` |
| Governing documents | [SRS](../srs.md) v5.1 (§1.4, FR-20–FR-22, BR-01 rev. 5.0, BR-21–BR-23, §10.3 AC-46–AC-55), [System SDS](../system-sds.md) §15.1, [Sprint 2 API spec](../sprints/sprint-2/api-spec.md) v4.0 (§17–§21), [Sprint 2 UI spec](../sprints/sprint-2/ui-spec.md) v4.0 (§14–§17), [Sprint 2 test spec](../sprints/sprint-2/tests.md) v4.0 (§9, canonical STS) |

---

## 1. Purpose and scope

In Sprint 1 through F-09, every `WAITING` entry in a service queue is processed strictly in arrival order (`joinedAt ASC, id ASC`, Sprint 1 BR-01). Real service counters frequently need to prioritize urgent, accessibility, or VIP customers ahead of regular arrivals while still preserving fair FIFO order among customers of the same priority level and preventing customers from self-promoting in line.

F-10 introduces an operator-managed two-level priority queue policy (`NORMAL` and `PRIORITY`):
- **Default `NORMAL` on join & server-enforced anti-self-elevation:** every customer join creates a `NORMAL` entry; any attempt by a `CUSTOMER` to supply a non-`NORMAL` priority on join or invoke the operator priority-update endpoint is rejected server-side with `403 FORBIDDEN`.
- **Operator priority management on `WAITING` entries:** an assigned `OPERATOR` can promote a `WAITING` entry to `PRIORITY` or return it to `NORMAL` via `PATCH /api/operator/queue-entries/{entryId}/priority`; attempting to modify priority on any non-`WAITING` entry is rejected with `409 INVALID_STATE_TRANSITION`.
- **Deterministic priority-aware FIFO ordering:** both F-09 counter-scoped Call Next and legacy queue-level Call Next claim the next eligible `WAITING` entry ordered strictly by `PRIORITY` before `NORMAL`, then `joinedAt ASC, id ASC`, using an explicit SQL sort expression inside `FOR UPDATE SKIP LOCKED` transactions. Customer `aheadCount` and operator waiting-list ordering use the exact same ordering rule.

### In scope
- PostgreSQL enum `QueuePriority` (`NORMAL`, `PRIORITY`), non-null `QueueEntry.priority` column defaulting to `NORMAL`, additive migration, and partial expression index `QueueEntry_waiting_priority_fifo_idx` on `WAITING` entries.
- New operator endpoint `PATCH /api/operator/queue-entries/{entryId}/priority` (assigned `OPERATOR`, session + CSRF, strict body `{ "priority": "NORMAL" | "PRIORITY" }`).
- Server-side validation on `POST /api/queues/{queueId}/entries` rejecting customer-supplied `{"priority": "PRIORITY"}` with `403 FORBIDDEN` and malformed/unknown `priority` values with `400 INVALID_ARGUMENT`, while continuing to accept empty bodies and `{"priority": "NORMAL"}` (`201 Created`).
- Priority-aware FIFO selection in both `callNextAtCounter` (F-09) and `callNextEntry` (legacy F-05), priority-aware `computeAheadCount`, and priority-aware `listOperatorQueueEntries`.
- Additive `priority` (`"NORMAL" | "PRIORITY"`) field on every serialized `QueueEntry` payload.
- Operator UI (`/operator/queues/:id`): **Priority** badge (text + icon) and **Set Priority** / **Set Normal** toggle enabled only for `WAITING` entries.
- Customer UI (`/customer/entries/:id` and `/customer` → My Active Tickets): read-only **Priority** badge (text + icon) when `priority === "PRIORITY"` and updated priority-aware `aheadCount` message while `WAITING`.
- Cross-feature alignment with F-07 (cancel), F-08 (`NO_SHOW` recovery preserves `priority`), and F-09 (concurrent multi-counter claiming).

### Out of scope (Sprint 2)
- **Automatic time-based anti-starvation aging:** Sprint 2 uses manual operator priority adjustment only (operators may promote long-waiting `NORMAL` entries or demote `PRIORITY` entries) so queue order remains 100% deterministic and testable. Automatic wait-time aging is deferred as a future enhancement (D-6).
- More than two priority levels (e.g., numeric scores or 3+ tiers).
- Customer self-selected priority, paid fast-track, or eligibility verification workflows.
- `ADMIN` role support (no `ADMIN` role exists in `Role` in `server/prisma/schema.prisma`; only `CUSTOMER` and `OPERATOR` exist).
- Counter-specific priority routing or priority-only counters (counter skill matching remains excluded).
- Priority wait-time analytics / reporting (F-11) and appointment booking (F-12).

---

## 2. Linked requirements

| Type | IDs | Notes |
|---|---|---|
| Functional (new) | FR-20, FR-21, FR-22 | Operator priority update & anti-self-elevation; priority-aware atomic Call Next / `aheadCount` / F-08 preservation; additive `priority` payload & operator/customer UI |
| Functional (unchanged, affected) | FR-03, FR-05, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-18, FR-19 | Assignment checks reused; join defaults to `NORMAL` & rejects self-elevation; operator list, `aheadCount`, and both Call Next endpoints adopt priority-aware FIFO; F-08 recovery preserves `priority` |
| Business rules (new / revised) | BR-01 (rev. 5.0), BR-21, BR-22, BR-23; BR-16 & BR-19 (rev. 5.0 notes) | See [SRS §5](../srs.md#5-business-rules-and-decisions) |
| Business rules (unchanged, verified) | BR-02, BR-03, BR-04, BR-05, BR-06, BR-07, BR-08, BR-09, BR-10, BR-11, BR-12, BR-13, BR-14, BR-15, BR-17, BR-18, BR-20 | Queue numbering, active-entry caps, privacy, lifecycle transitions, counter integrity, and F-07/F-08/F-09 invariants preserved |
| Non-functional | NFR-02, NFR-03, NFR-04, NFR-05, NFR-06, NFR-08 | No new NFR; NFR-04 planned via `PERF-S2-004` on 1,000-entry dataset |
| Acceptance criteria | AC-46 – AC-55 | [SRS §10.3](../srs.md#103-acceptance-criteria-sprint-2-f-10-rev-50) |

---

## 3. Workflow and state / sequence diagrams

### 3.1 Core workflow
1. Customer 1 (`N1`, joined at `t0`) and Customer 2 (`N2`, joined at `t1`) join **General Inquiry Desk** (`POST /api/queues/{queueId}/entries`). Both entries are persisted as `status = WAITING`, `priority = NORMAL`.
2. On `/operator/queues/:id`, the assigned operator sees `N1` ahead of `N2` in the **Waiting Queue** section.
3. Because Customer 2 requires urgent assistance, the operator selects **Set Priority** on `N2` (`PATCH /api/operator/queue-entries/{N2}/priority` with `{"priority":"PRIORITY"}`). PostgreSQL commits `priority = PRIORITY` without changing `joinedAt`, `queueNumber`, or `status`.
4. Immediately after the refresh, the operator's **Waiting Queue** displays `N2` (`Priority` badge) ahead of `N1`. On `/customer/entries/:id`, Customer 2 sees a read-only `Priority` badge and `"You are next"` (`aheadCount: 0`), while Customer 1 sees `"Currently waiting. 1 person ahead of you."` (`aheadCount: 1`).
5. When the operator selects **Call Next** at **Counter 1** (`POST /api/operator/counters/{C1}/call-next`), `N2` is atomically claimed (`status = CALLED`, `counterId = C1`, `priority = PRIORITY`). Attempting to change `N2`'s priority now returns `409 INVALID_STATE_TRANSITION`, and the UI no longer renders a priority toggle on `N2`.
6. If `N2` is marked `NO_SHOW` (F-08) and later returned to the queue (`POST .../recover`), `N2` returns to `WAITING` with `calledAt = NULL`, `counterId = NULL`, original `joinedAt`, and **`priority = PRIORITY` preserved**, placing `N2` ahead of `NORMAL` entries again.

### 3.2 Workflow & priority-ordering diagram

```mermaid
flowchart TD
    A["Customer POST /api/queues/:queueId/entries"] --> B{"priority field present?"}
    B -- "No / NORMAL" --> C["Persist QueueEntry (WAITING, priority = NORMAL)"]
    B -- "PRIORITY" --> D["Reject 403 FORBIDDEN (no DB write)"]
    B -- "Other invalid value" --> E["Reject 400 INVALID_ARGUMENT (no DB write)"]

    C --> F["Operator PATCH /api/operator/queue-entries/:entryId/priority"]
    F --> G{"Auth + CSRF + OPERATOR + assigned?"}
    G -- "No session" --> G1["401 UNAUTHORIZED"]
    G -- "Customer / unassigned / bad CSRF" --> G2["403 FORBIDDEN"]
    G -- "Unknown entryId" --> G3["404 RESOURCE_NOT_FOUND"]
    G -- "Yes" --> H{"Entry status === WAITING?"}
    H -- "No (CALLED/SERVING/COMPLETED/CANCELLED/NO_SHOW)" --> H1["409 INVALID_STATE_TRANSITION"]
    H -- "Yes" --> I["Commit priority = PRIORITY or NORMAL (200 OK)"]

    I --> J["Operator Call Next (Counter F-09 or Legacy F-05)"]
    J --> K["SELECT WAITING ORDER BY CASE(PRIORITY=0, NORMAL=1), joinedAt ASC, id ASC FOR UPDATE SKIP LOCKED LIMIT 1"]
    K --> L["Atomic UPDATE status = CALLED (+ counterId if counter route)"]
```

### 3.3 Priority mutability across `QueueStatus` lifecycle

```mermaid
stateDiagram-v2
    [*] --> WAITING: Customer join (priority = NORMAL)
    WAITING --> WAITING: Assigned operator PATCH /priority (NORMAL <-> PRIORITY)
    WAITING --> CALLED: Priority-ordered Call Next (priority locked)
    WAITING --> CANCELLED: Customer cancel [F-07] (priority retained for history)
    CALLED --> SERVING: Start Service (priority locked)
    SERVING --> COMPLETED: Complete Service (priority retained for history)
    CALLED --> NO_SHOW: Mark No-show [F-08] (priority locked)
    NO_SHOW --> WAITING: Return to queue [F-08] (priority PRESERVED; mutable again while WAITING)
```

| `QueueEntry.status` | `PATCH .../priority` allowed? | `priority` value invariant |
|---|---|---|
| `WAITING` | **Yes** (assigned `OPERATOR`, `200 OK`) | `NORMAL` or `PRIORITY` (mutable; defaults to `NORMAL` on join; preserved on F-08 recovery) |
| `CALLED` | **No** (`409 INVALID_STATE_TRANSITION`) | Preserved from when called |
| `SERVING` | **No** (`409 INVALID_STATE_TRANSITION`) | Preserved from when called |
| `COMPLETED` | **No** (`409 INVALID_STATE_TRANSITION`) | Preserved for history |
| `CANCELLED` | **No** (`409 INVALID_STATE_TRANSITION`) | Preserved for history |
| `NO_SHOW` | **No** (`409 INVALID_STATE_TRANSITION`) | Preserved from when called; carried back to `WAITING` if recovered via F-08 |

---

## 4. Business rules and design decisions

| ID | Decision and rationale |
|---|---|
| D-1 | **Two-level `QueuePriority` enum (`NORMAL`, `PRIORITY`) with explicit SQL sort key.** Declaring `enum QueuePriority { NORMAL PRIORITY }` with `@default(NORMAL)` keeps the domain minimal and readable. Because PostgreSQL enum comparison (`<` / `>`) depends on enum declaration order (where `NORMAL < PRIORITY` would sort `NORMAL` before `PRIORITY` under `ASC`), every SQL query and index uses the explicit expression `CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END ASC, "joinedAt" ASC, "id" ASC`. Ordering is therefore immune to enum declaration order. |
| D-2 | **RBAC uses existing `Role.OPERATOR` + `OperatorAssignment` (no `ADMIN` role).** Inspection of `server/prisma/schema.prisma` confirms `enum Role { CUSTOMER, OPERATOR }`. Only an authenticated `OPERATOR` assigned to `entry.serviceQueueId` may update priority, matching `start`, `complete`, `no-show`, and `recover` (`AD-08`). |
| D-3 | **Endpoint path `PATCH /api/operator/queue-entries/{entryId}/priority` matches existing operator entry routes.** All existing operator entry mutations live under `/api/operator/queue-entries/:entryId/{start,complete,no-show,recover}`, and counter updates use `PATCH /api/operator/counters/:counterId/status`. Placing priority updates at `PATCH /api/operator/queue-entries/{entryId}/priority` keeps middleware order (`validateUuidParam('entryId')` → `requireAuth` → `requireCsrf` → `requireRole(OPERATOR)` → body validation → `FOR UPDATE` transaction) identical to F-08/F-09 and avoids redundant `:queueId` mismatch edge cases (flagged in review note R-1). |
| D-4 | **Strict server-side rejection of customer self-elevation on join (`POST /api/queues/{queueId}/entries`) with body validation BEFORE database lookups (v1.1).** Existing Sprint 1/F-07/F-08/F-09 clients send an empty body on join. After `validateUuidParam('queueId')`, `requireAuth`, `requireRole(CUSTOMER)`, and `requireCsrf`, request-body `priority` validation runs **before** any DB lookup (`404` queue not found, `409` queue `CLOSED`, `409 DUPLICATE_ACTIVE_ENTRY`, `409 MAX_ACTIVE_ENTRIES_REACHED`): malformed JSON or any unknown/non-string `priority` value (e.g., `"HIGH"`, `123`, `null`, `""`) is rejected with `400 INVALID_ARGUMENT`; `{"priority":"PRIORITY"}` is explicitly rejected with `403 FORBIDDEN` (never silently ignored); and empty/omitted body or literal `{"priority":"NORMAL"}` proceeds to DB checks and creates a `NORMAL` entry (`201 Created`). (R-2 resolved.) |
| D-5 | **Priority updates allowed only on `WAITING` entries, idempotent on same value, independent of parent queue `availability`.** Changing priority after an entry is `CALLED`, `SERVING`, `COMPLETED`, `CANCELLED`, or `NO_SHOW` has no queue-ordering effect and is rejected with `409 INVALID_STATE_TRANSITION` (reusing the existing standard error code; R-3 resolved). Setting `PRIORITY -> PRIORITY` or `NORMAL -> NORMAL` on a `WAITING` entry succeeds idempotently (`200 OK`), matching F-09 `PATCH .../status` (D-8). Parent queue `CLOSED` status does not block priority updates on existing `WAITING` entries (`AD-05`). |
| D-6 | **Anti-starvation policy (Sprint 2): manual operator adjustment only.** Automatic time-based aging (e.g., auto-promoting `NORMAL` entries after N minutes) is explicitly excluded in Sprint 2 because the system has no service-day clock policy (same rationale as F-08 D-2) and time-dependent promotion complicates deterministic E2E/concurrency tests. Operators can manually promote long-waiting `NORMAL` entries or demote `PRIORITY` entries at any time. Automatic aging is deferred to Sprint 3+, and the starvation risk is explicitly documented in §7.4 Known Limitations (R-4 resolved). |
| D-7 | **F-08 `NO_SHOW` recovery preserves `priority`.** F-08 (`docs/features/sprint-2-f08-no-show-recovery.md` D-3) returns a recovered entry to its original queue position by preserving `joinedAt` and `queueNumber` while clearing `calledAt` (and F-09 clears `counterId`). F-10 preserves `priority` on recovery so a priority customer who missed their call once retains their priority tier upon operator-approved recovery; if staff wish to downgrade them, they can immediately toggle priority to `NORMAL` while the entry is `WAITING` (R-5 resolved). |
| D-8 | **Both F-09 counter Call Next and legacy queue-level Call Next use priority-aware FIFO.** Updating both `callNextAtCounter` and legacy `callNextEntry` ensures consistent BR-01 rev. 5.0 behavior across all call paths—including the zero-usable-counter legacy UI fallback (`COUNTER-019`)—while keeping all Sprint 1 / F-07 / F-08 / F-09 regression tests (where all entries default to `NORMAL`) 100% green unmodified. |
| D-9 | **`computeAheadCount` and `GET /api/operator/queues/{queueId}/entries` ordering (`WAITING`-only priority rank, v1.1).** `computeAheadCount` counts `WAITING` entries in the same queue with either a strictly higher priority (`PRIORITY` ahead of `NORMAL`) or the same priority and `(joinedAt, id) < (entry.joinedAt, entry.id)`. In `GET /api/operator/queues/{queueId}/entries`, priority ranking applies **ONLY to `WAITING` entries** (`ORDER BY CASE WHEN "status" = 'WAITING'::"QueueStatus" AND "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END ASC, "joinedAt" ASC, "id" ASC`): `WAITING` entries appear in exact Call Next order, while non-`WAITING` sections (`CALLED`/`SERVING` Active Service, `NO_SHOW`, `COMPLETED`) retain strict chronological `joinedAt ASC, id ASC` ordering without distortion (preserving Sprint 1 `QUEUE-007` as well; R-6 resolved). |
| D-10 | **Additive `priority` field on every `QueueEntry` payload.** `formatQueueEntry` always emits `priority: "NORMAL" | "PRIORITY"`. Clients that ignore unknown fields remain unaffected, and both operator and customer screens render priority badges without extra API calls. |

---

## 5. Layer-by-layer definitions

### 5.1 Data layer (Prisma / PostgreSQL)

| Item | Definition |
|---|---|
| New enum | `enum QueuePriority { NORMAL PRIORITY }` (PostgreSQL `CREATE TYPE "QueuePriority" AS ENUM ('NORMAL', 'PRIORITY')`) |
| New column on `QueueEntry` | `priority QueuePriority @default(NORMAL)` (`ALTER TABLE "QueueEntry" ADD COLUMN "priority" "QueuePriority" NOT NULL DEFAULT 'NORMAL'`) |
| New PostgreSQL index | Partial expression index in migration SQL (supports exact `ORDER BY` index scan for Call Next and `aheadCount`, independent of enum declaration order):<br>`CREATE INDEX "QueueEntry_waiting_priority_fifo_idx" ON "QueueEntry" ("serviceQueueId", (CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC, "joinedAt" ASC, "id" ASC) WHERE "status" = 'WAITING'::"QueueStatus";` |
| Migration | Additive migration `server/prisma/migrations/20261128163000_f10_priority_queue_policy/migration.sql` (applied to `qms_db` and `qms_test_db` at `a286f9b`) |
| Existing indexes & constraints | `QueueEntry_active_customer_queue_uidx`, `QueueEntry_serviceQueueId_queueNumber_key`, `QueueEntry_fifo_idx`, `QueueEntry_customer_joinedAt_idx`, `QueueEntry_counterId_idx`, `QueueEntry_noShowCount_range_check`, `QueueEntry_counterId_serviceQueueId_fkey` (`ON DELETE RESTRICT ON UPDATE RESTRICT`), and all `Counter` constraints are **unchanged** |
| Seed (`server/prisma/seed.ts`) & `provision-counters.ts` | **No change** (seed creates users, queues, operator assignments, and counters; no queue entries are pre-seeded, and any created entry defaults to `NORMAL`) |
| Row invariants (asserted by tests) | (1) `priority IN ('NORMAL', 'PRIORITY')` and never `NULL`; (2) `PATCH .../priority` never mutates `joinedAt`, `queueNumber`, `status`, `counterId`, or any lifecycle timestamp; (3) all Sprint 1, Lab 7 BR-06, F-07, F-08, and F-09 row invariants continue to hold |

**Migration and rollback safety:**
- The migration is strictly additive: `CREATE TYPE "QueuePriority"` + `ADD COLUMN "priority" "QueuePriority" NOT NULL DEFAULT 'NORMAL'` backfills all existing rows to `'NORMAL'` in place in PostgreSQL 11+ (metadata-only instant default) with zero downtime or data loss.
- Apply the migration to the deployed database **before** the new Cloud Run revision serves traffic.
- Rollback caveat: a pre-F-10 revision ignores the new `priority` column on read and inserts rows with DB default `'NORMAL'`, so rolling back does not crash Prisma reads, though priority ordering stops being honored until F-10 is re-deployed (any `PRIORITY` values remain persisted in PostgreSQL).

---

### 5.2 API layer

#### Updated `QueueEntry` object (additive; extends Sprint 2 api-spec §12.2)

```json
{
  "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
  "serviceQueueId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "customerId": "11111111-1111-4111-8111-111111111111",
  "queueNumber": 7,
  "status": "WAITING",
  "priority": "PRIORITY",
  "joinedAt": "2026-11-28T09:00:00.000Z",
  "calledAt": null,
  "serviceStartedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "noShowAt": null,
  "recoveredAt": null,
  "noShowCount": 0,
  "counterId": null,
  "counterName": null,
  "aheadCount": 0
}
```

`priority` (`"NORMAL" | "PRIORITY"`) is included in **every** `QueueEntry` response across all existing and new endpoints.

#### New endpoint: `PATCH /api/operator/queue-entries/{entryId}/priority`

- **Purpose:** Update the priority (`NORMAL` ↔ `PRIORITY`) of a `WAITING` queue entry in an operator's assigned queue (FR-20).
- **Headers:** `Cookie: <session-cookie>`, `X-CSRF-Token: <token-from-session>`, `Content-Type: application/json`.
- **Request body** (strict Zod schema `z.object({ priority: z.enum(['NORMAL', 'PRIORITY']) }).strict()`):
  ```json
  {
    "priority": "PRIORITY"
  }
  ```
- **Validation & processing order:**
  1. `validateUuidParam('entryId')` → `400 INVALID_ARGUMENT` if not UUIDv4.
  2. `requireAuth` → `401 UNAUTHORIZED` if missing/invalid/expired session.
  3. `requireCsrf` → `403 FORBIDDEN` if missing/wrong CSRF header.
  4. `requireRole(Role.OPERATOR)` → `403 FORBIDDEN` for `CUSTOMER` (including the entry's owner).
  5. Body schema validation (`z.object({ priority: z.enum(['NORMAL', 'PRIORITY']) }).strict()`) → `400 INVALID_ARGUMENT` on missing body, unknown/non-string `priority`, or extra unknown keys.
  6. Inside one transaction:
     - `SELECT "id", "serviceQueueId", "status", "priority" FROM "QueueEntry" WHERE "id" = $1::uuid FOR UPDATE` → missing returns `404 RESOURCE_NOT_FOUND`.
     - Verify `OperatorAssignment` for `(caller, entry.serviceQueueId)` → missing returns `403 FORBIDDEN`.
     - Verify `entry.status === 'WAITING'` → otherwise returns `409 INVALID_STATE_TRANSITION`.
     - Update `priority = body.priority` (idempotent if unchanged; `joinedAt`, `queueNumber`, and all timestamps unchanged). Commit before responding.
- **Success response:** `200 OK`, `{ "data": { "entry": <QueueEntry> } }`.

#### Changes to existing endpoints

| Endpoint | Change |
|---|---|
| `POST /api/queues/{queueId}/entries` | Always creates `WAITING` entries with `priority: "NORMAL"`. **Explicit validation order (v1.1):** (1) `validateUuidParam('queueId')` (`400`) → (2) `requireAuth` (`401`) → (3) `requireRole(CUSTOMER)` (`403`) → (4) `requireCsrf` (`403`) → (5) **request-body `priority` validation BEFORE any DB lookup**: malformed JSON or unknown/non-string `priority` (e.g., `"HIGH"`, `123`, `null`, `""`) returns `400 INVALID_ARGUMENT`; `{"priority":"PRIORITY"}` returns `403 FORBIDDEN` (even if the queue does not exist or is `CLOSED`); omitted/empty body or literal `{"priority":"NORMAL"}` proceeds to → (6) DB transaction checks (`404 RESOURCE_NOT_FOUND` → `409 QUEUE_NOT_AVAILABLE` → `409 DUPLICATE_ACTIVE_ENTRY` → `409 MAX_ACTIVE_ENTRIES_REACHED` → `201 Created` with `priority: "NORMAL"`). |
| `POST /api/operator/counters/{counterId}/call-next` (F-09) | Ordering updated from `"joinedAt" ASC, "id" ASC` to `(CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC, "joinedAt" ASC, "id" ASC` inside `FOR UPDATE SKIP LOCKED`. Response includes `priority`. |
| `POST /api/operator/queues/{queueId}/call-next` (legacy F-05) | Ordering updated identically to `(CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC, "joinedAt" ASC, "id" ASC` inside `FOR UPDATE SKIP LOCKED`; keeps `counterId = NULL` and `204 No Content` when empty. Response includes `priority`. |
| `GET /api/operator/queues/{queueId}/entries` | Priority ranking applies **only to `WAITING` entries** (v1.1): `ORDER BY (CASE WHEN "status" = 'WAITING'::"QueueStatus" AND "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC, "joinedAt" ASC, "id" ASC`. Non-`WAITING` statuses (`CALLED`, `SERVING`, `NO_SHOW`, `COMPLETED`) retain strict chronological `joinedAt ASC, id ASC` ordering within their UI sections. Response includes `priority`. |
| `GET /api/me/queue-entries/{entryId}` | `computeAheadCount` counts only `WAITING` entries in the same queue strictly ahead under `(priority_rank ASC, joinedAt ASC, id ASC)`. Response includes `priority`. |
| `GET /api/me/queue-entries`, `POST /api/me/queue-entries/{entryId}/cancel` (F-07), `POST /api/operator/queue-entries/{entryId}/{start,complete,no-show,recover}` (F-05/F-08) | Transition logic unchanged; `recoverNoShowEntry` preserves `priority`; every returned `QueueEntry` includes additive `priority`. |
| `GET /api/queues`, `GET /api/auth/*`, `GET /api/operator/queues`, `GET /api/operator/queues/{queueId}/counters`, `PATCH /api/operator/counters/{counterId}/status` | **No change.** |

---

### 5.3 UI layer

| Screen / Component | Change |
|---|---|
| `/operator/queues/:id` (`client/src/pages/OperatorQueueDetailPage.tsx`) | - Render a clear **Priority** badge (text `"Priority"` + star/arrow icon, never color alone) next to the status badge on any entry where `entry.priority === 'PRIORITY'`. (Standard `NORMAL` entries need no noisy badge, or show no priority badge so urgent entries stand out immediately.)<br>- Render the **Waiting Queue** section in the priority-aware FIFO order returned by the API (rename subtitle from `"FIFO"` to `"Priority & FIFO"` or keep heading `"Waiting Queue"` with clear order).<br>- On **`WAITING` entries only**, render a native `<button>` toggle: `"Set Priority"` (`aria-label="Set queue number N as priority"`) when `NORMAL`, or `"Set Normal"` (`aria-label="Set queue number N to normal priority"`) when `PRIORITY`. Never render this button on `CALLED`, `SERVING`, `NO_SHOW`, or `COMPLETED` entries.<br>- Busy state: disable the entry's priority button with `"Updating priority..."` and per-entry in-flight ref guard against double-clicks.<br>- Success: announce `"Queue number N priority set to Priority."` / `"Queue number N priority set to Normal."` in the existing `aria-live="polite"` region and refresh the entry list.<br>- Error mapping (§6): show user-safe `role="alert"` message and refresh the entry list on `409` or `404`. |
| `/customer/entries/:id` (`client/src/pages/EntryDetailPage.tsx`) | - Render a read-only **Priority** badge (text `"Priority"` + icon, never color alone) when `entry.priority === 'PRIORITY'`.<br>- **No priority edit/toggle control** anywhere on customer views.<br>- Existing `aheadCount` messages (`"You are next"`, `"Currently waiting. N people ahead of you."`) automatically reflect the server's priority-aware `aheadCount`.<br>- **Non-monotonic `aheadCount` note (v1.1):** Because promoting another waiting entry to `PRIORITY` increases a `NORMAL` customer's `aheadCount` by 1, `aheadCount` is **no longer strictly monotonically decreasing**. While `entry.status === 'WAITING'`, render the subtle helper note `"Queue position may adjust when priority customers are accommodated."` below the `aheadCount` message (see [Sprint 2 UI spec §15](../sprints/sprint-2/ui-spec.md#15-priority-badge-customer-read-only-view-and-non-monotonic-aheadcount)) so an upward count change is expected UX rather than mistaken for a bug. |
| `/customer` → My Active Tickets (`client/src/components/customer/MyTicketsList.tsx`) | - Render the read-only **Priority** badge next to the status badge on ticket cards where `entry.priority === 'PRIORITY'`. No edit control. |
| `/login`, `/operator` (dashboard), `/customer` → Available Queues (`AvailableQueues.tsx`), `CounterPanel.tsx` | **No change.** |

---

### 5.4 Layers with no change

- Authentication, session storage, cookies, CSRF middleware (`requireCsrf`), UUID validation middleware (`validateUuidParam`), and queue-assignment middleware (`requireQueueAssignment`): **No change.**
- Customer queue discovery (`GET /api/queues`) and queue-number monotonic allocation (`ServiceQueue.lastQueueNumber`): **No change.**
- BR-05 same-queue duplicate guard and Lab 7 BR-06 2-active-entry cross-queue cap (`joinQueue` and `recoverNoShowEntry`): **No change.**
- F-05 `startServiceEntry` / `completeServiceEntry`, F-07 `cancelEntry`, F-08 `markNoShowEntry` / `recoverNoShowEntry` transition rules (other than returning additive `priority` via `formatQueueEntry`): **No change.**
- F-09 counter listing, counter open/close toggling, counter ownership enforcement (`assignedOperatorId`), and counter provisioning scripts (`seed.ts`, `provision-counters.ts`): **No change.**
- Docker multi-stage build and Cloud Run deployment workflow: **No change** (standard additive migration applied before deploy).

---

## 6. Validation, error contract, boundaries, and permissions

### 6.1 Permission and status-code matrix

| Endpoint | Caller | Assignment / Payload / State | HTTP | Error code | DB change |
|---|---|---|---|---|---|
| `PATCH /api/operator/queue-entries/{entryId}/priority` | Anonymous | any | `401` | `UNAUTHORIZED` | none |
| `PATCH /api/operator/queue-entries/{entryId}/priority` | Any role | missing or wrong `X-CSRF-Token` | `403` | `FORBIDDEN` | none |
| `PATCH /api/operator/queue-entries/{entryId}/priority` | `CUSTOMER` (owner or other) | valid session + CSRF | `403` | `FORBIDDEN` | none |
| `PATCH /api/operator/queue-entries/{entryId}/priority` | `OPERATOR` | malformed `entryId` (non-UUIDv4) | `400` | `INVALID_ARGUMENT` | none |
| `PATCH /api/operator/queue-entries/{entryId}/priority` | `OPERATOR` | missing/invalid body, unknown `priority`, or extra keys | `400` | `INVALID_ARGUMENT` | none |
| `PATCH /api/operator/queue-entries/{entryId}/priority` | `OPERATOR` | unknown valid UUIDv4 `entryId` | `404` | `RESOURCE_NOT_FOUND` | none |
| `PATCH /api/operator/queue-entries/{entryId}/priority` | `OPERATOR` (unassigned) | valid entry in unassigned queue | `403` | `FORBIDDEN` | none |
| `PATCH /api/operator/queue-entries/{entryId}/priority` | `OPERATOR` (assigned) | entry is `CALLED`, `SERVING`, `COMPLETED`, `CANCELLED`, or `NO_SHOW` | `409` | `INVALID_STATE_TRANSITION` | none |
| `PATCH /api/operator/queue-entries/{entryId}/priority` | `OPERATOR` (assigned) | entry is `WAITING`, `{"priority":"PRIORITY"}` or `{"priority":"NORMAL"}` (`OPEN` or `CLOSED` queue) | `200` | — | `priority` updated |
| `POST /api/queues/{queueId}/entries` | `CUSTOMER` | empty body or `{"priority":"NORMAL"}` (`OPEN` queue, within BR-05/BR-06) | `201` | — | `WAITING` entry created (`NORMAL`) |
| `POST /api/queues/{queueId}/entries` | `CUSTOMER` | `{"priority":"PRIORITY"}` (checked **before** DB `404`/`409` lookups) | `403` | `FORBIDDEN` | none |
| `POST /api/queues/{queueId}/entries` | `CUSTOMER` | malformed JSON or unknown `priority` (e.g., `"HIGH"`, `123`, `null`, `""`; checked **before** DB `404`/`409` lookups) | `400` | `INVALID_ARGUMENT` | none |

### 6.2 UI error mapping (operator priority action)

| API response | Operator page message | Follow-up |
|---|---|---|
| `409 INVALID_STATE_TRANSITION` | `"This entry is no longer waiting, so its priority cannot be changed."` | Refresh entry list |
| `404 RESOURCE_NOT_FOUND` | `"We couldn't find that queue entry."` | Refresh entry list |
| `400 INVALID_ARGUMENT` | `"Invalid priority request. Please refresh and try again."` | None |
| `403 FORBIDDEN` (CSRF vs RBAC) | Existing CSRF or `"You do not have permission to perform this action."` | None |
| `401 UNAUTHORIZED` | Existing global session-expired banner | Global handler |
| Network or other | `"Something went wrong. Please try again."` | None |

Server error messages are never rendered directly to users.

---

## 7. Concurrency and lock-order analysis

### 7.1 Transaction steps

**Update entry priority** (`updateEntryPriority` in `server/src/services/operatorService.ts`), one transaction:
1. Lock the entry row: `SELECT "id", "serviceQueueId", "status", "priority" FROM "QueueEntry" WHERE "id" = $1::uuid FOR UPDATE`. Missing → `404 RESOURCE_NOT_FOUND`.
2. Verify `OperatorAssignment` for `(operatorId, entry.serviceQueueId)`. Missing → `403 FORBIDDEN`.
3. Verify `entry.status === 'WAITING'`. Otherwise → `409 INVALID_STATE_TRANSITION`.
4. Update `priority = targetPriority` (without changing `joinedAt`, `queueNumber`, or `status`). Commit before responding `200 OK`.

**Priority-ordered Call Next** (`callNextAtCounter` and legacy `callNextEntry`):
```sql
SELECT "id", clock_timestamp() AS "now"
FROM "QueueEntry"
WHERE "serviceQueueId" = $serviceQueueId::uuid
  AND "status" = 'WAITING'::"QueueStatus"
ORDER BY (CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC,
         "joinedAt" ASC,
         "id" ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

**Operator entry list** (`listOperatorQueueEntries`, v1.1):
```sql
SELECT ...
FROM "QueueEntry"
WHERE "serviceQueueId" = $queueId::uuid
  AND "status" <> 'CANCELLED'::"QueueStatus"
ORDER BY (CASE WHEN "status" = 'WAITING'::"QueueStatus" AND "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC,
         "joinedAt" ASC,
         "id" ASC
```
Priority ranking affects `WAITING` entries only; `CALLED`, `SERVING`, `NO_SHOW`, and `COMPLETED` entries retain chronological `joinedAt ASC, id ASC` order.

### 7.2 Deadlock-freedom analysis

`updateEntryPriority` acquires a single row lock on `QueueEntry` (`FOR UPDATE`), identical to `startServiceEntry`, `completeServiceEntry`, and `markNoShowEntry`. The global lock hierarchy remains strictly acyclic:
- `User` (`FOR NO KEY UPDATE`) → `ServiceQueue` (`FOR UPDATE`) → `QueueEntry` (`FOR UPDATE`) (`joinQueue`, `recoverNoShowEntry`)
- `Counter` (`FOR UPDATE`) → `QueueEntry` (`FOR UPDATE SKIP LOCKED`) (`callNextAtCounter`)
- `QueueEntry` (`FOR UPDATE`) alone (`updateEntryPriority`, `startServiceEntry`, `completeServiceEntry`, `markNoShowEntry`, `cancelEntry`)

No operation acquires `QueueEntry` before `User`, `ServiceQueue`, or `Counter`, so F-10 introduces **zero** deadlock cycles.

### 7.3 Race matrix

| Race | Possible outcomes | Never happens |
|---|---|---|
| Counter 1 Call Next vs Counter 2 Call Next (mixed `PRIORITY` + `NORMAL` waiting entries) | Both claim distinct entries with zero double-claims/lost updates; `PRIORITY` entries are claimed ahead of `NORMAL` (within `FOR UPDATE SKIP LOCKED` semantics: if Counter 1 locks `P1`, Counter 2 skips `P1` and claims `P2` or `N1`) | Both counters claim the same entry; lost update |
| `PATCH .../priority` vs Call Next on the same `WAITING` entry `E` | (a) Priority commits before Call Next scans → Call Next sees updated priority and claims `E` cleanly (`200` + `200`); (b) Call Next locks/commits `CALLED` first → `PATCH .../priority` waits on `FOR UPDATE`, reads `status = CALLED`, returns `409 INVALID_STATE_TRANSITION`; (c) `PATCH .../priority` holds lock while Call Next runs `SKIP LOCKED` → Call Next skips `E` (claiming next eligible entry or returning `409 NO_WAITING_ENTRIES`/`204`) and `PATCH` succeeds (`200`) | Deadlock; priority updated on a `CALLED` entry |
| `PATCH .../priority` vs F-07 customer `cancel` on the same `WAITING` entry `E` | Either priority commits first then cancel commits `CANCELLED` (`200` + `200`), or cancel commits `CANCELLED` first and `PATCH .../priority` returns `409 INVALID_STATE_TRANSITION` | Deadlock; priority mutated after `CANCELLED` |
| Two parallel `PATCH .../priority` on the same `WAITING` entry `E` | Serialized on `QueueEntry` `FOR UPDATE`; both return `200 OK` and final DB state matches the second committer | Deadlock; corrupted state |

### 7.4 Known limitations (v1.1)

1. **Starvation risk for `NORMAL` entries (manual anti-starvation only):** Because automatic time-based priority aging is intentionally deferred to Sprint 3+ (D-6, R-4), a continuous stream of newly promoted `PRIORITY` entries can indefinitely delay `NORMAL` entries waiting in the same queue. Operational mitigation in Sprint 2 is manual operator intervention (promoting long-waiting `NORMAL` entries or demoting `PRIORITY` entries via `PATCH /api/operator/queue-entries/{entryId}/priority`).
2. **`FOR UPDATE SKIP LOCKED` temporary skip during concurrent `PATCH .../priority`:** As documented in §7.3(c), if an operator updates priority on the sole `WAITING` entry `E` at the exact moment another operator invokes Call Next, `FOR UPDATE SKIP LOCKED` skips the locked row `E` rather than blocking, returning `409 NO_WAITING_ENTRIES` (F-09 counter Call Next) or `204 No Content` (legacy F-05 Call Next) for that single call; a subsequent Call Next immediately claims `E` once the priority transaction commits.
3. **Non-monotonic `aheadCount` for `NORMAL` entries:** Promoting a later-arriving waiting entry to `PRIORITY` increases a `NORMAL` customer's `aheadCount` by 1. Customer UI (§5.3, UI spec §15) explicitly communicates this behavior so customers understand position adjustments.

---

## 8. Acceptance criteria (summary)

Full normative acceptance criteria are defined in [SRS §10.3](../srs.md#103-acceptance-criteria-sprint-2-f-10-rev-50):
- **AC-46:** Default `NORMAL` priority on join + additive `priority` field across every `QueueEntry` payload.
- **AC-47:** Priority-aware Call Next (`PRIORITY` before `NORMAL`, FIFO `(joinedAt ASC, id ASC)` tie-breaking) on both counter-scoped and legacy Call Next, matching `aheadCount`; `GET .../entries` applies priority rank to `WAITING` entries only (keeping non-`WAITING` sections chronological); pure FIFO preserved when all entries are `NORMAL`.
- **AC-48:** Assigned operator updates `WAITING` entry priority (`NORMAL` ↔ `PRIORITY`), idempotent repeat, works on `CLOSED` queue, `joinedAt`/`queueNumber` unchanged, persisted across reload.
- **AC-49:** Non-`WAITING` priority update rejected with `409 INVALID_STATE_TRANSITION`; invalid payload / UUID rejected with `400 INVALID_ARGUMENT`.
- **AC-50:** Server-side RBAC, CSRF, assignment, and customer anti-self-elevation checks (`401`/`403`/`404` on `PATCH .../priority`; on customer join, body validation runs **before** DB `404`/`409` lookups so `{"priority":"PRIORITY"}` returns `403` and malformed `priority` returns `400` regardless of queue existence/availability).
- **AC-51:** Multi-counter Call Next concurrency with mixed priorities and `PATCH .../priority` vs Call Next / Cancel races (≥ 15 rounds each, zero deadlocks, zero double-claims), explicitly accepting all three deterministic `SKIP LOCKED` outcomes in §7.3(a)–(c) including `PATCH` `200` + `Call Next` `409 NO_WAITING_ENTRIES` / `204` when `E` is the only `WAITING` entry.
- **AC-52:** Cross-feature F-08 recovery preserves `priority` (`PRIORITY` and `NORMAL`), and F-07 cancellation works for `PRIORITY` `WAITING` entries while retaining `priority` for history.
- **AC-53:** Additive schema migration (`QueuePriority` enum, `DEFAULT 'NORMAL'`, partial expression index `QueueEntry_waiting_priority_fifo_idx`), existing constraints unchanged, and NFR-04 latency verified (`PERF-S2-004`).
- **AC-54:** Operator UI Priority badge (text + icon), priority-ordered Waiting Queue (chronological non-`WAITING` sections), `WAITING`-only toggle (`Set Priority` / `Set Normal`), busy/live/error handling, keyboard-only, 360 px / 1280 px zero overflow.
- **AC-55:** Customer UI read-only Priority badge (zero edit controls), updated priority-aware `aheadCount` with non-monotonic adjustment note, 360 px / 1280 px zero overflow, and full Sprint 1 / Lab 7 / F-07 / F-08 / F-09 regression (`REG-S2-004`).

---

## 9. System Test Specification (STS)

The **authoritative / canonical System Test Specification** for F-10 (`PRIO-001` – `PRIO-018`, `REG-S2-004`, `PERF-S2-004`, AC coverage matrix, SQL row invariants, and §9.5 execution results) lives in **[Sprint 2 Test Specification §9](../sprints/sprint-2/tests.md#9-f-10-priority-queue-policy)** (following the same single-source-of-truth convention used by F-07, F-08, and F-09; executed and passing at GREEN commit `a286f9b` with RED baseline `c99236b`).

Quick test-group index (see `tests.md §9` for exact setups, inputs, and expected outcomes):
- **Unit (`server/tests/f10-priority-rule.test.ts`):** `PRIO-001` (priority validation, mutability, rank & tie-breaking helpers).
- **API+DB (`server/tests/f10-priority-queue.test.ts`):** `PRIO-002`–`PRIO-009` (defaults, priority-aware Call Next, `WAITING`-only operator list ordering & `aheadCount`, `PATCH .../priority`, non-`WAITING` `409`, payload/UUID `400`/`404`, RBAC/CSRF `401`/`403`, customer join anti-self-elevation before DB lookups), `PRIO-010`–`PRIO-011` (multi-counter concurrency & `SKIP LOCKED` race outcomes), `PRIO-012` (F-08 recovery & F-07 cancel cross-feature), `PRIO-013` (DB enum, partial expression index & constraints).
- **Client (`client/src/test/f10-priorityQueue.test.tsx`):** `PRIO-014`–`PRIO-015` (operator Priority badge/`WAITING`-only toggle/errors; customer read-only badge & non-monotonic `aheadCount` note).
- **E2E Chromium (`e2e/tests/f10-priority-queue.spec.ts`):** `PRIO-016`–`PRIO-018` (promotion + reload + counter call + customer views; F-08 recovery + stale `409`; keyboard-only & 360/1280 px responsive).
- **Regression & NFR-04:** `REG-S2-004` and `PERF-S2-004` (`server/tests/nfr/perf-s2-004-priority.ts`).

---

## 10. Definition of Done & evidence checklist (Issue #43)

- [x] Contract v1.1 (`docs/srs.md` v5.1, `docs/features/sprint-2-f10-priority-queue-policy.md` v1.1, and synced Sprint 2 specs) reviewed and approved by `@TeekhathatTT` (PR #67, merged to `sprint2-staging` at `4b93e72`)
- [x] Sprint 2 supporting specs (`docs/sprints/sprint-2/api-spec.md` v4.0, `ui-spec.md` v4.0, `tests.md` v4.0, `docs/features.md`, `docs/system-sds.md`, `docs/traceability.md`) synced with Contract v1.1
- [x] Red tests (`PRIO-001` – `PRIO-018`) committed first (`c99236b`); existing client tests stayed green (127/127) while F-10 tests failed red ([f10-red-run.txt](../sprints/sprint-2/evidence/f10-red-run.txt))
- [x] Prisma schema & additive SQL migration (`20261128163000_f10_priority_queue_policy`: `QueuePriority`, `QueueEntry.priority`, `QueueEntry_waiting_priority_fifo_idx`) applied to `qms_db` and `qms_test_db` and verified (`PRIO-013`, `a286f9b`)
- [x] Backend priority policy, `PATCH /api/operator/queue-entries/:entryId/priority`, anti-self-elevation guard on join (before DB lookups), priority-aware Call Next (F-09 + legacy F-05), `aheadCount`, and `WAITING`-only priority ordering in `listOperatorQueueEntries` implemented (`a286f9b`)
- [x] Frontend operator Priority badge + `WAITING`-only toggle and customer read-only Priority badge + non-monotonic `aheadCount` note implemented (`a286f9b`)
- [x] All `PRIO-001` – `PRIO-018` tests executed and passing locally (Unit, API+DB, Concurrency, Cross-feature F-07/F-08/F-09, Client, E2E Chromium at `a286f9b`; [f10-green-run.txt](../sprints/sprint-2/evidence/f10-green-run.txt))
- [x] Full regression (`REG-S2-004`: Sprint 1, Lab 7 BR-06, F-07, F-08, F-09) passing locally (Server 20/20 / 280 tests, Client 9/9 / 138 tests, E2E 25/25 Chromium at `a286f9b`; 1-line button-query scope note in `tests.md §9.5`)
- [x] NFR-04 measured for F-10 (`PERF-S2-004`, evidence saved to `docs/sprints/sprint-2/evidence/perf-s2-004.txt`) and F-10 E2E screenshots saved under `docs/sprints/sprint-2/evidence/f10-*.png` (captioned in [f10-evidence-notes.md](../sprints/sprint-2/evidence/f10-evidence-notes.md))
- [ ] Server typecheck, server build, client build (`tsc && vite build`), and `docker build` pass *(server typecheck, server build, and client `tsc && vite build` passed at `a286f9b`; `docker build` not run locally on this branch)*
- [x] `docs/sprints/sprint-2/completion.md`, `tests.md`, and `traceability.md` updated with actual verified results
- [ ] PR into `sprint2-staging` reviewed by `@TeekhathatTT`, CI green
- [ ] Release DoD (at release): Cloud SQL migration applied before deploy and production verification recorded

---

## 11. Review notes (resolved in v1.1)

| # | Topic | Resolution (`@TeekhathatTT` review, 2026-11-28) | Status |
|---|---|---|---|
| R-1 | Endpoint path (`D-3`) | Agreed on `PATCH /api/operator/queue-entries/{entryId}/priority`, matching existing `/api/operator/queue-entries/{entryId}/{start,complete,no-show,recover}` and `PATCH /api/operator/counters/{counterId}/status`. | Resolved |
| R-2 | Customer `{"priority":"NORMAL"}` on join (`D-4`) | Agreed on accepting literal `{"priority":"NORMAL"}` (and empty body) while rejecting `{"priority":"PRIORITY"}` (`403 FORBIDDEN`) and malformed values (`400 INVALID_ARGUMENT`), enforced **before** DB `404`/`409` lookups. | Resolved |
| R-3 | Non-`WAITING` error code (`D-5`) | Agreed on reusing `409 INVALID_STATE_TRANSITION` for non-`WAITING` entries (consistent with F-07 and F-08). | Resolved |
| R-4 | Manual anti-starvation policy (`D-6`) | Agreed on deferring automatic time-based priority aging to Sprint 3+; starvation risk explicitly documented under §7.4 Known Limitations. | Resolved |
| R-5 | F-08 `NO_SHOW` recovery interaction (`D-7`) | Agreed on preserving `priority` on F-08 `NO_SHOW` recovery (aligned with F-08 D-3 preserving `joinedAt` and `queueNumber`). | Resolved |
| R-6 | Operator list ordering (`D-9`) | Agreed, with scope refined so priority ranking applies **only to `WAITING` entries**, preserving chronological `joinedAt ASC, id ASC` order for non-`WAITING` statuses (`CALLED`, `SERVING`, `NO_SHOW`, `COMPLETED`). | Resolved |

---

## 12. Revision history

| Version | Date | Author | Section | Previous text (kept for the record) | New text / reason |
|---|---|---|---|---|---|
| v1.0 | 2026-11-28 | `@Khwanklao` | All | — | Initial Contract v1.0 authored for Issue #43 (`F-10 Priority queue policy`), aligned with SRS v5.0, F-07, F-08 (v1.1 + BR-06), and F-09 (v1.3). Pending review by `@TeekhathatTT`. Future revisions will append rows here without rewriting prior history. |
| v1.1 | 2026-11-28 | `@Khwanklao` | Header, §4 (`D-4`, `D-6`, `D-9`), §5.2–§5.3, §6.1, §7.1, §7.4, §8, §9, §10, §11 | v1.0 had inline STS duplicating `tests.md`, omitted `SKIP LOCKED` race outcome (c) from AC-51(b)/PRIO-011, did not state join body validation runs before DB `404`/`409` lookups, applied priority sort to all statuses in `GET .../entries`, lacked explicit starvation risk and non-monotonic `aheadCount` UI notes, and had R-1–R-6 open. | Contract v1.1 addressing `@TeekhathatTT`'s PR review: aligns AC-51(b)/§7.3/PRIO-011 on `SKIP LOCKED` race outcome (c); mandates request-body validation before DB lookups on customer join; scopes `listOperatorQueueEntries` priority sort strictly to `WAITING` entries; adds §7.4 Known Limitations (starvation risk, `SKIP LOCKED` skip, non-monotonic `aheadCount`); adds customer UI non-monotonic position note; syncs Sprint 2 `tests.md` (designated canonical STS), `api-spec.md`, `ui-spec.md`, `traceability.md`, `features.md`, and `system-sds.md`; records R-1–R-6 as resolved. |
| v1.2 | 2026-11-28 | `@Khwanklao` | Header, §5.1, §9, §10 | Status was `Contract v1.1 — Pending Final Re-review`, migration path was `<timestamp>` placeholder, and implementation/verification DoD items were unchecked. | Post-GREEN documentation update recording Contract v1.1 approval & merge (`4b93e72`, PR #67), TDD RED (`c99236b`), TDD GREEN (`a286f9b`), concrete migration `20261128163000_f10_priority_queue_policy`, full local test/perf/E2E verification results, and Deliverable 2 evidence artifacts (`f10-red-run.txt`, `f10-green-run.txt`, `perf-s2-004.txt`, `f10-evidence-notes.md`, `f10-*.png`). PR merge, `docker build`, and release/deploy items remain unchecked until executed. |
