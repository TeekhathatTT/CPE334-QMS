# Software Requirements Specification (SRS)

## Document control

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-08 | Team | Sprint 1 baseline (FR-01–FR-13, BR-01–BR-12, NFR-01–NFR-08, AC-01–AC-16) |
| 1.1 | 2026-11-27 | @Khwanklao (review: @TeekhathatTT) | Lab 7 change request (issue #51), released on `main` at `1f34952`: BR-06 now limits a customer to at most 2 active entries across all queues (`409 MAX_ACTIVE_ENTRIES_REACHED`); FR-12, AD-06 and §7 updated. Merged into the Sprint 2 line in rev. 4.2. |
| 2.0 | 2026-11-27 | @TeekhathatTT (review: @Khwanklao, pending) | Sprint 2 F-07 contract v1: adds FR-14, BR-13, BR-14, AC-17–AC-24, §1.1 and §10; revises BR-05, BR-09, the CUSTOMER permission row and the transition table. The old text is kept in §11 Revision history. |
| 2.0.1 | 2026-11-27 | @TeekhathatTT (review: @Khwanklao, pending) | Verification note only, no requirement changed: NFR-04 is measured for the F-07 cancel mutation and the operations F-07 changed (PERF-S2-001). See §11. |
| 3.0 | 2026-11-27 | @TeekhathatTT (review: @Khwanklao, pending) | Sprint 2 F-08 contract v1 (issue #41): adds FR-15, FR-16, BR-15, BR-16, BR-17, AC-25–AC-34, §1.2, §10.1 and the error code `RECOVERY_LIMIT_REACHED`; revises BR-05, BR-09, the OPERATOR permission row, the transition table and the §1 / §1.1 scope notes. The old text is kept in §11 Revision history. |
| 4.0 | 2026-11-27 | @Khwanklao (review: @TeekhathatTT, pending) | Sprint 2 F-09 contract v1 (issue #42): adds FR-17–FR-19, BR-18–BR-20, AC-35–AC-44, §1.3, §10.2 and error codes `COUNTER_CLOSED` and `NO_WAITING_ENTRIES`; updates the OPERATOR permission row, BR-10, BR-16, the transition table and the §1 / §1.2 scope notes. The old text is kept in §11 Revision history. |
| 4.1 | 2026-11-27 | @Khwanklao (review: @TeekhathatTT, pending) | Sprint 2 F-09 contract v1.1 (PR review fixes): clarifies BR-19 legacy Call Next backwards-compatibility trade-off, upgrades BR-20 to composite FK (`MATCH SIMPLE`), rewords AC-40(a) for parallel `SKIP LOCKED`, adds composite FK to AC-41(c), and clarifies AC-42/AC-43 disabled other-operator counter controls, 0-usable-counter fallback, and `CALLED`/`SERVING`-only counter badges. Old text kept in §11 Revision history. |
| 4.2 | 2026-11-27 | @TeekhathatTT (review: @Khwanklao, pending) | Merges rev. 1.1 (Lab 7, BR-06) from `main` into the Sprint 2 line. BR-06 and AD-06 now name `CANCELLED` and `NO_SHOW` as not counting toward the cap. Open question: whether returning a `NO_SHOW` entry to the queue (BR-16) must respect the BR-06 cap. See §11. |

## 1. Purpose and Scope

The Queue and Service Management System (QMS) supports a service counter or restaurant by replacing informal queue coordination with a persistent, auditable, role-based workflow. Sprint 1 delivers the minimum usable vertical slice: authentication, authorization, queue discovery, customer queue registration, queue-number assignment, customer status lookup, and operator lifecycle control. The system is designed for browser-based use, an HTTP API, relational storage, and seed data for local verification.

Included in Sprint 1:
- authenticated CUSTOMER and OPERATOR roles
- queue catalog and queue availability rules
- customer join workflow and private status reads
- queue-number generation and FIFO processing
- operator actions to call, start, and complete service
- transactional integrity and access-control validation

Excluded from Sprint 1:
- customer self-registration
- password reset
- cancellation and no-show workflows
- multiple counters or priority queue logic
- analytics and appointment booking

*Rev. 2.0 note:* the "Excluded from Sprint 1" list above is still true for Sprint 1. Sprint 2 adds customer cancellation through F-07 (§1.1). No-show handling stays excluded until F-08 is specified.

*Rev. 3.0 note:* F-08 is now specified; see §1.2.

*Rev. 4.0 note:* F-09 (multi-counter support) is now specified; see §1.3.

### 1.1 Sprint 2 additions (rev. 2.0)

F-07 (Customer cancellation and queue withdrawal, Issue #40) adds to Sprint 2:
- a customer may cancel their own `WAITING` entry; the entry becomes the terminal status `CANCELLED` with a server-generated `cancelledAt` time and is kept for history
- a cancelled entry is not active, so the customer may join the same queue again and receives a new queue number

Still excluded after rev. 2.0:
- leaving a `CALLED` or `SERVING` entry, and no-show handling (F-08) (*rev. 3.0:* no-show handling is added by F-08, §1.2; a customer still cannot leave a `CALLED` or `SERVING` entry themselves)
- operator-initiated cancellation, and reinstating a cancelled entry
- multiple counters, priority queues, analytics and appointment booking (F-09–F-12)

Feature design: [features/sprint-2-f07-customer-cancellation.md](./features/sprint-2-f07-customer-cancellation.md).

### 1.2 Sprint 2 additions (rev. 3.0)

F-08 (No-show handling and recovery, Issue #41) adds to Sprint 2:
- an assigned operator may mark a `CALLED` entry as `NO_SHOW` when the customer does not come to the counter; the server records `noShowAt` and counts the no-show in `noShowCount`
- an assigned operator may return (recover) a `NO_SHOW` entry to the queue **once**; it becomes `WAITING` again at its **original FIFO position** (its `joinedAt` and queue number do not change) and `recoveredAt` is recorded
- a second no-show of the same entry is final: it cannot be returned again
- a `NO_SHOW` entry is not active, so the customer may also join the same queue again with a new number

Still excluded after rev. 3.0:
- an automatic no-show timer or grace period (the operator decides)
- customers marking themselves as no-show or returning themselves to the queue
- a configurable recovery limit, a per-event audit log, and no-show analytics (F-11)
- multiple counters, priority queues and appointment booking (F-09, F-10, F-12) (*rev. 4.0:* multi-counter support is added by F-09, §1.3)

Feature design: [features/sprint-2-f08-no-show-recovery.md](./features/sprint-2-f08-no-show-recovery.md).

### 1.3 Sprint 2 additions (rev. 4.0)

F-09 (Multi-counter support, Issue #42) adds to Sprint 2:
- named service counters (`OPEN` / `CLOSED`) belonging to a `ServiceQueue`, provisioned via deterministic idempotent seed data (`Counter 1`, `Counter 2` per seeded queue)
- operator endpoints to list a queue's counters (`GET /api/operator/queues/{queueId}/counters`), toggle counter status (`PATCH /api/operator/counters/{counterId}/status`), and call the next eligible `WAITING` entry for a specific `OPEN` counter (`POST /api/operator/counters/{counterId}/call-next`)
- concurrency-safe multi-counter claiming (`Counter` row lock + `QueueEntry` `FOR UPDATE SKIP LOCKED`) so parallel calls across counters never double-claim the same entry
- additive `counterId` and `counterName` fields on every serialized `QueueEntry` payload, displayed on both the operator queue workspace and the customer's ticket when `CALLED` or `SERVING`
- backward-compatible preservation of legacy `POST /api/operator/queues/{queueId}/call-next` (`counterId = NULL`, `204 No Content` when empty) and clearing `counterId` alongside `calledAt` when an entry is recovered from `NO_SHOW` (F-08)

Still excluded after rev. 4.0:
- runtime admin CRUD to create, rename, or delete counters, or UI to assign specific operators to counters
- priority queue routing and counter skill matching (F-10)
- per-counter analytics and wait/service-time reporting (F-11)
- advance appointment booking (F-12)

Feature design: [features/sprint-2-f09-multi-counter.md](./features/sprint-2-f09-multi-counter.md).

## 2. Concrete Stakeholder Problem

Customers often stand near the service counter waiting for attention, but they cannot reliably tell how many people are ahead of them or how long they may still have to wait. When queue information is unclear or the calling process is inconsistent, customers may hesitate to leave the waiting area because they fear missing their turn, and they may become frustrated and lose confidence in the service experience. This is especially disruptive in busy service environments where the waiting line is not visible to everyone and where customers are expected to remain nearby while they wait.

Operators must often manage queues manually or by informal communication, and they can easily become confused about serving order. A queue may be skipped, called incorrectly, or processed in a conflicting order when multiple customers believe they are next. Without a reliable shared record of queue state, operators can accidentally call the wrong person and create a dispute or service delay. The organization therefore lacks a consistent way to coordinate customer flow and maintain trust in the service process.

For management, inconsistent queue handling reduces customer confidence and weakens the quality of service. Without reliable queue records it is difficult to measure waiting time and service time, identify bottlenecks, or assess whether staffing and service processes are working effectively. A centralized queue management system is needed to provide a single, auditable source of truth for queue state, clear customer communication, and disciplined operator action.

## 3. Actors and Permissions

| Actor | Allowed | Enforcement |
|---|---|---|
| Anonymous | login only | no access to protected endpoints |
| CUSTOMER | login/logout, list OPEN queues, join an OPEN queue, read own entry, cancel own `WAITING` entry (rev. 2.0) | no operator actions, no access to other customers' private entries |
| OPERATOR | login/logout, view assigned queues, view queue entries, call next, start, complete, mark a `CALLED` entry no-show, return a `NO_SHOW` entry to the queue (rev. 3.0), list queue counters, open/close counters, call next for an `OPEN` counter (rev. 4.0) | must be assigned to the target queue (and match `Counter.assignedOperatorId` if set) |
| Provisioning seed | create users, queues, and operator assignments | no runtime interactive access |

Access control is enforced on every request: role, ownership, and queue assignment must be checked before API actions are executed. A customer looking up another customer's entry must receive the same `404 RESOURCE_NOT_FOUND` response as a nonexistent entry. An authenticated operator without an assignment to the target queue must receive `403 FORBIDDEN`.

## 4. Functional Requirements

| ID | Requirement | Actor | Priority | AC |
|---|---|---|---|---|
| FR-01 | Authenticate a valid user by email and password, establish a server-validated session, and reject invalid credentials without revealing account state. | CUSTOMER, OPERATOR | M | AC-01, AC-02 |
| FR-02 | Return the current authenticated user identity and role, support logout, and reject protected requests after logout or session expiry. | CUSTOMER, OPERATOR | M | AC-01, AC-03 |
| FR-03 | Enforce role permissions and queue-assignment checks on every operator action. | All | M | AC-03, AC-04, AC-05 |
| FR-04 | List only OPEN queues in the customer join catalog with public name, description, and availability status. | CUSTOMER | M | AC-06 |
| FR-05 | Join an OPEN queue and persist a `WAITING` entry that includes queue number, queue name, and join time. | CUSTOMER | M | AC-07, AC-08 |
| FR-06 | Allocate queue numbers in a concurrency-safe, database-guarded manner that maintains queue-local uniqueness. | System | M | AC-08, AC-09 |
| FR-07 | Return only the customer's own entry details and statuses; never return another customer's private data. | CUSTOMER | M | AC-10 |
| FR-08 | Show assigned queues and entries in deterministic FIFO order, exposing only the minimum service-required customer information. | OPERATOR | M | AC-04, AC-11 |
| FR-09 | Atomically call the oldest eligible `WAITING` entry; if no entry is eligible, return `204 No Content`. | OPERATOR | M | AC-11, AC-12, AC-13 |
| FR-10 | Move a managed `CALLED` entry to `SERVING`. | OPERATOR | M | AC-14 |
| FR-11 | Move a managed `SERVING` entry to `COMPLETED`. | OPERATOR | M | AC-15 |
| FR-12 | Reject malformed data, duplicate active joins, cross-queue active entry cap breaches (`BR-06`), closed queues, invalid state transitions, and stale concurrent mutations through the API error contract. | All | M | AC-07, AC-13, AC-16; CR51-AC1–CR51-AC4 |
| FR-13 | Record server-generated UTC lifecycle timestamps and preserve completed entries for historical review. | System | M | AC-08, AC-15 |
| FR-14 | Let a customer cancel (withdraw) their own `WAITING` queue entry. The entry becomes `CANCELLED`, `cancelledAt` is recorded, and the row is kept and stays visible in the customer's own entry reads. Requests from other customers, other roles, or for entries in any other status are rejected through the API error contract. (Sprint 2, F-07, rev. 2.0) | CUSTOMER | M | AC-17–AC-24 |
| FR-15 | Let an operator assigned to the entry's queue mark a `CALLED` entry as `NO_SHOW` when the customer did not come to the counter. `noShowAt` is recorded and `noShowCount` is increased by one; the row is kept. Requests from unassigned operators, other roles, or for entries in any other status are rejected through the API error contract. (Sprint 2, F-08, rev. 3.0) | OPERATOR | M | AC-25, AC-26, AC-27, AC-31, AC-32, AC-33 |
| FR-16 | Let an operator assigned to the entry's queue return a `NO_SHOW` entry to the queue once. The entry becomes `WAITING` at its original FIFO position, `calledAt` is cleared, `recoveredAt` is recorded, and the queue number is kept. The request is rejected when the entry was already returned once, when it is not `NO_SHOW`, or when the customer already has another active entry in that queue. (Sprint 2, F-08, rev. 3.0) | OPERATOR | M | AC-27, AC-28, AC-29, AC-30, AC-32, AC-33 |
| FR-17 | Let an operator assigned to a queue list its service counters in deterministic order and toggle a counter's status between `OPEN` and `CLOSED`. Requests from unassigned operators, operators who do not match a counter's `assignedOperatorId` (when set), other roles, or with invalid status payloads are rejected through the API error contract. (Sprint 2, F-09, rev. 4.0) | OPERATOR | M | AC-35, AC-36, AC-37, AC-42 |
| FR-18 | Let an assigned operator call the oldest eligible `WAITING` entry in FIFO order for a specific `OPEN` counter, atomically committing `status = CALLED`, `calledAt`, and `counterId` so concurrent calls across counters never double-claim an entry. Reject calls on a `CLOSED` counter (`409 COUNTER_CLOSED`) and report an empty waiting queue (`409 NO_WAITING_ENTRIES`), while preserving legacy queue-level Call Next (`204 No Content`). (Sprint 2, F-09, rev. 4.0) | OPERATOR | M | AC-37, AC-38, AC-39, AC-40, AC-41, AC-42 |
| FR-19 | Include additive `counterId` and `counterName` fields on every serialized `QueueEntry` payload and display the assigned counter clearly in the operator workspace and on the customer's entry views when the entry is `CALLED` or `SERVING`. (Sprint 2, F-09, rev. 4.0) | CUSTOMER, OPERATOR | M | AC-38, AC-42, AC-43, AC-44 |

## 5. Business Rules and Decisions

| ID | Rule | Decision and rationale |
|---|---|---|
| BR-01 | FIFO processing by `(joinedAt ASC, id ASC)` with eligible status `WAITING` | Stable ordering without priority; required for operator call-next behavior |
| BR-02 | Queue numbers are positive integers scoped to a single service queue | Avoids collisions across different queues; numbers are unique within one queue during the queue lifecycle |
| BR-03 | Number generation is protected at the database layer using a transactional row lock | Prevents duplicate numbers under concurrent join requests; application pre-checks are insufficient alone |
| BR-04 | Queue numbers do not automatically reset in Sprint 1 | Keeps the queue-number contract deterministic and avoids service-day ambiguity |
| BR-05 | One active entry per customer per queue; active = `WAITING`, `CALLED`, `SERVING` | **Rev. 3.0:** `COMPLETED`, `CANCELLED` and `NO_SHOW` entries are not active, so the customer may join that queue again and receives a new, larger queue number (BR-02, BR-04). Returning a `NO_SHOW` entry to the queue makes it active again, so it is rejected while the customer has another active entry in that queue (BR-16). The database partial unique index is unchanged. (Sprint 1 and rev. 2.0 text in §11.) |
| BR-06 | A customer may hold at most 2 active queue entries (`WAITING`, `CALLED`, or `SERVING`) across all queues simultaneously, and at most one active entry per customer per queue (BR-05). Attempting to join a 3rd `OPEN` queue while holding 2 active entries is rejected with `409 MAX_ACTIVE_ENTRIES_REACHED`. | Prevents queue hoarding across counters while allowing customers to participate in up to two distinct service flows simultaneously. Entries that are not active (`COMPLETED`, `CANCELLED` from rev. 2.0, `NO_SHOW` from rev. 3.0) do not count toward the 2-entry limit (Updated 2026-11-27, Issue #51). |
| BR-07 | One queue entry belongs to one customer and one queue; customer reads are self-scoped and operators scope through assigned queues | Prevents cross-customer and cross-queue leakage |
| BR-08 | Queue availability is `OPEN` or `CLOSED`; only `OPEN` queues appear in the customer join catalog | Makes availability testable and consistent with the queuing workflow |
| BR-09 | Valid lifecycle is `WAITING -> CALLED -> SERVING -> COMPLETED`, plus `WAITING -> CANCELLED` by the owning customer (rev. 2.0), plus `CALLED -> NO_SHOW` and `NO_SHOW -> WAITING` (once per entry) by an assigned operator (rev. 3.0) | No other alternate transitions or repeats are allowed. `COMPLETED` and `CANCELLED` are terminal. `NO_SHOW` is terminal once `noShowCount` is 2, or once the entry can no longer be returned. (Sprint 1 and rev. 2.0 text in §11.) |
| BR-10 | `Call Next` on an empty queue returns `204 No Content` and performs no state change | Defines the empty-queue case without raising a workflow error. **Rev. 4.0:** applies to the legacy queue-level endpoint (`POST /api/operator/queues/{queueId}/call-next`); counter-scoped Call Next (`POST /api/operator/counters/{counterId}/call-next`) returns `409 NO_WAITING_ENTRIES` with no state change (BR-19). (Original text in §11.) |
| BR-11 | Lifecycle timestamps are server-generated UTC values written atomically with the status change | Ensures consistent history and testability |
| BR-12 | Transactions and database constraints enforce uniqueness and state invariants | Reduces race conditions and guarantees consistent results |
| BR-13 | Only the customer who owns an entry may cancel it, and only while it is `WAITING`. The queue's availability (`OPEN` or `CLOSED`) does not matter. Cancelling a `CALLED`, `SERVING`, `COMPLETED` or already `CANCELLED` entry is rejected with `409 INVALID_STATE_TRANSITION`; a repeated cancel is not an idempotent success. A non-owner receives `404 RESOURCE_NOT_FOUND`; a non-customer role receives `403 FORBIDDEN`. (rev. 2.0, F-07) | A customer must always be able to leave the line. A called customer who leaves is a no-show (F-08), and service in progress is the operator's to end. Privacy follows BR-07 / AD-07. |
| BR-15 | Only an operator assigned to the entry's queue may mark it `NO_SHOW`, and only while it is `CALLED`. There is no grace period: the operator may mark it at any time after the call. The queue's availability does not matter. Marking a `WAITING`, `SERVING`, `COMPLETED`, `CANCELLED` or already `NO_SHOW` entry is rejected with `409 INVALID_STATE_TRANSITION`. An unassigned operator receives `403 FORBIDDEN`; a customer (including the entry's owner) receives `403 FORBIDDEN`; an unknown entry returns `404 RESOURCE_NOT_FOUND`. (rev. 3.0, F-08) | The operator is the one who sees whether the customer came. A timer would need a clock policy this system does not have. Customers cannot mark themselves (issue #41). |
| BR-16 | Only an operator assigned to the entry's queue may return a `NO_SHOW` entry to the queue, and only while `noShowCount` is 1. The entry becomes `WAITING` with its original `joinedAt` and queue number, so it is next in FIFO order among the entries that joined after it; `calledAt` is set to `NULL` and `recoveredAt` is recorded. **Rev. 4.0:** `counterId` is also set to `NULL` on return (BR-20). If the entry is called and marked `NO_SHOW` again (`noShowCount` 2), a return is rejected with `409 RECOVERY_LIMIT_REACHED`. A return of a non-`NO_SHOW` entry is rejected with `409 INVALID_STATE_TRANSITION`. If the customer already has another active entry in the same queue, the return is rejected with `409 DUPLICATE_ACTIVE_ENTRY`. The queue's availability does not matter. (rev. 3.0, F-08; rev. 4.0, F-09) | A late customer gets one more chance at the place they already had, without a new number, and a repeat no-show does not block the line forever. BR-05 must still hold, so a customer who rejoined keeps the new entry. Clearing `counterId` ensures the next Call Next records the newly calling counter. |
| BR-17 | `NO_SHOW` is not active. A `NO_SHOW` row is never deleted, is never eligible for Call Next, keeps its queue number, is **shown** in the operator entry list (so it can be returned), stays visible in the customer's own reads, and is not counted in any `aheadCount`. Each status change and its server-generated UTC timestamp (`noShowAt`, `recoveredAt`) and `noShowCount` are committed atomically. `noShowCount` is between 0 and 2, enforced by a database `CHECK` constraint. `noShowAt` holds the time of the latest no-show. (rev. 3.0, F-08) | Keeps history (FR-13), the FIFO rule (BR-01) and BR-11; makes the recovery limit hold in the database, not only in code. |
| BR-14 | `CANCELLED` is a terminal status. The status change and the server-generated UTC `cancelledAt` are committed atomically in one conditional update. A cancelled row is never deleted, is never eligible for Call Next, keeps its queue number (never reused), is excluded from the operator entry list, and is not counted in any `aheadCount`. (rev. 2.0, F-07) | Keeps history (FR-13) and the FIFO rule (BR-01) intact, and makes cancel and Call Next mutually exclusive on the same entry (BR-12, NFR-03). |
| BR-18 | A `ServiceQueue` may have zero or more named `Counter` records (`(serviceQueueId, name)` unique), each with status `OPEN` or `CLOSED` (default `OPEN`) and an optional `assignedOperatorId` referencing an `OPERATOR` user. Only an operator assigned to `counter.serviceQueueId` may list counters for that queue or toggle a counter's status; if `assignedOperatorId` is non-null, only that operator may toggle or call next on that counter (`403 FORBIDDEN` otherwise). Counter creation and deletion are provisioned by seed data rather than runtime CRUD in Sprint 2. (rev. 4.0, F-09) | Keeps multi-counter permissions aligned with AD-08 while allowing per-counter operator scoping when needed without adding admin CRUD scope. |
| BR-19 | **Scope: counter-scoped Call Next (`POST /api/operator/counters/{counterId}/call-next`).** Allowed only when `counter.status` is `OPEN`; calling on a `CLOSED` counter is rejected with `409 COUNTER_CLOSED`. It atomically locks the `Counter` row (`FOR UPDATE`), selects the oldest unlocked `WAITING` entry in `counter.serviceQueueId` (`ORDER BY "joinedAt" ASC, "id" ASC FOR UPDATE SKIP LOCKED LIMIT 1`), and commits `status = CALLED`, `calledAt = clock_timestamp()`, and `counterId = counter.id`; if no `WAITING` entry exists, it returns `409 NO_WAITING_ENTRIES`. Closing a counter blocks only future Call Next on that counter; entries already `CALLED` or `SERVING` at that counter retain their `counterId` and may still be started, completed, or marked no-show. Parent queue availability (`OPEN`/`CLOSED`) is not checked (consistent with AD-05). **Rev. 4.1:** Retaining the legacy queue-level endpoint (`POST /api/operator/queues/{queueId}/call-next`) without counter `OPEN`/`assignedOperatorId` checks is an explicitly accepted backwards-compatibility trade-off solely to preserve unmodified Sprint 1 / F-07 / F-08 regression suites (deprecation/removal deferred to a future sprint); legacy Call Next explicitly writes `counterId = NULL` and keeps `204 No Content` when empty (BR-10). (rev. 4.0, rev. 4.1, F-09) | Guarantees deadlock-free, double-claim-free parallel service across counters while allowing in-flight customers to finish when a counter closes and keeping Sprint 1 / F-07 / F-08 regression suites intact. |
| BR-20 | `QueueEntry.counterId` is nullable and enforced at the database layer (BR-12) by a PostgreSQL composite foreign key `FOREIGN KEY ("counterId", "serviceQueueId") REFERENCES "Counter"("id", "serviceQueueId") ON DELETE RESTRICT` (`MATCH SIMPLE`, default), backed by `UNIQUE ("id", "serviceQueueId")` on `Counter`. `MATCH SIMPLE` allows `counterId IS NULL` while strictly rejecting any non-null `counterId` belonging to a different `serviceQueueId`. Every serialized `QueueEntry` includes additive `counterId` (`string \| null`) and `counterName` (`string \| null`). Entries in `WAITING` or `CANCELLED` always have `counterId = NULL`. When a `NO_SHOW` entry is returned to `WAITING` (BR-16), `counterId` is cleared to `NULL` alongside `calledAt`. Legacy queue-level Call Next explicitly writes `counterId = NULL`. (rev. 4.0, rev. 4.1, F-09) | Enforces same-queue counter integrity at the database level while preserving full backward compatibility with Sprint 1, F-07, and F-08 tests and letting customer views display the counter name directly without extra API calls. |

### Transition table

| From → To | Actor / operation | Timestamp | Invalid action |
|---|---|---|---|
| New → WAITING | Customer joins OPEN queue | `joinedAt` | Reject invalid or closed joins |
| WAITING → CALLED | Assigned operator calls next (queue-level or `OPEN` counter, rev. 4.0) | `calledAt` (and `counterId` for counter Call Next) | Reject with `409 INVALID_STATE_TRANSITION`, `409 COUNTER_CLOSED` (closed counter), or `409 NO_WAITING_ENTRIES` (empty queue on counter Call Next) |
| CALLED → SERVING | Assigned operator starts service | `serviceStartedAt` | Reject with `409 INVALID_STATE_TRANSITION` |
| SERVING → COMPLETED | Assigned operator completes service | `completedAt` | Reject with `409 INVALID_STATE_TRANSITION` |
| WAITING → CANCELLED (rev. 2.0) | Owning customer cancels | `cancelledAt` | Any other source status: `409 INVALID_STATE_TRANSITION`; status changed during the request: `409 CONCURRENT_MODIFICATION` |
| CALLED → NO_SHOW (rev. 3.0) | Assigned operator marks no-show | `noShowAt`; `noShowCount` + 1 | Any other source status: `409 INVALID_STATE_TRANSITION` |
| NO_SHOW → WAITING (rev. 3.0; rev. 4.0) | Assigned operator returns the entry to the queue (only when `noShowCount` = 1) | `recoveredAt`; `calledAt` and `counterId` set to `NULL`; `joinedAt` unchanged | Not `NO_SHOW`: `409 INVALID_STATE_TRANSITION`; `noShowCount` = 2: `409 RECOVERY_LIMIT_REACHED`; customer has another active entry in the queue: `409 DUPLICATE_ACTIVE_ENTRY` |
| Counter `OPEN` ↔ `CLOSED` (rev. 4.0) | Assigned operator toggles counter status (`PATCH /api/operator/counters/{counterId}/status`) | `Counter.updatedAt` | Invalid status payload: `400 INVALID_ARGUMENT`; unassigned / mismatched operator: `403 FORBIDDEN`; unknown counter: `404 RESOURCE_NOT_FOUND` |

## 6. Non-Functional Requirements

| NFR ID | Requirement | Target value / pass condition | Verification method | Sprint |
|---|---|---|---|---|
| NFR-01 | Passwords must be stored only as salted adaptive hashes; no credentials, password hashes, or session secrets may be returned or logged. | Pass if password hashes are generated with Argon2id or a reviewed bcrypt configuration and no secrets appear in API responses or logs. | Security review and integration tests for login and session handling. | 1 |
| NFR-02 | Authorization must be enforced server-side and cookie-authenticated mutations must include CSRF protection. | Pass if protected endpoints reject missing/expired session and unauthorized actions fail with 401/403 responses; CSRF token required for state-changing requests. | API integration and security validation. | 1 |
| NFR-03 | Duplicate queue numbers, duplicate active entries, and invalid double-claims must not occur under concurrent load. | Pass if DB-backed concurrency tests show no duplicate queue numbers or double claims for the same active queue entry. | Integration and concurrency tests against PostgreSQL. | 1 |
| NFR-04 | Read operations should complete within the local performance target and mutation operations should remain within the local mutation target on a seeded 1,000-entry dataset. | p95 read latency <= 500 ms; p95 mutation latency <= 1,000 ms; workload = 100 requests per operation against a local database. | Performance test execution (for example k6 or equivalent) on the local environment. | 1 |
| NFR-05 | Successful mutations must not be reported before the database commit is durable. | Pass if API success responses are returned only after commit and a restart preserves committed writes. | Database integration tests and restart validation. | 1 |
| NFR-06 | The interface must remain usable at small and large widths without page-level horizontal scrolling. | Pass if no horizontal overflow is present at 360 px and 1280 px widths for the core customer and operator flows. | Browser-based E2E validation using Playwright or equivalent. | 1 |
| NFR-07 | Local setup must be reproducible and seed data must create test accounts and queues. | Pass if the documented setup steps from a clean checkout create the required seeded records without manual intervention. | Manual local setup verification. | 1 |
| NFR-08 | The UI and API must support the defined customer and operator workflows without exposing private or cross-owner information. | Pass if customer/private detail access is blocked and only assigned queue data is visible to operators. | Integration and E2E validation. | 1 |

## 7. Error Handling and API Contract Summary

| Scenario | HTTP status | Error code |
|---|---|---|
| User is not authenticated | 401 | `UNAUTHORIZED` |
| Operator accesses a queue not assigned to them | 403 | `FORBIDDEN` |
| Customer attempts to access another customer's entry | 404 | `RESOURCE_NOT_FOUND` |
| Invalid queue state transition | 409 | `INVALID_STATE_TRANSITION` |
| Closed queue or duplicate active join | 409 | `QUEUE_NOT_AVAILABLE` or `DUPLICATE_ACTIVE_ENTRY` |
| Cross-queue active entry cap reached (2 active entries held) | 409 | `MAX_ACTIVE_ENTRIES_REACHED` |
| Invalid payload or malformed identifier | 400 | `INVALID_ARGUMENT` |
| Empty queue on Call Next | 204 | No body |
| Customer cancels an entry that is not `WAITING` (rev. 2.0) | 409 | `INVALID_STATE_TRANSITION` |
| Entry changed by another request during a cancel (rev. 2.0) | 409 | `CONCURRENT_MODIFICATION` |
| Operator marks no-show on an entry that is not `CALLED`, or returns an entry that is not `NO_SHOW` (rev. 3.0) | 409 | `INVALID_STATE_TRANSITION` |
| Operator returns an entry that was already returned once (rev. 3.0) | 409 | `RECOVERY_LIMIT_REACHED` |
| Operator returns an entry while the customer has another active entry in that queue (rev. 3.0) | 409 | `DUPLICATE_ACTIVE_ENTRY` |
| Operator calls next on a `CLOSED` counter (rev. 4.0) | 409 | `COUNTER_CLOSED` |
| Operator calls next on an `OPEN` counter when no `WAITING` entries exist (rev. 4.0) | 409 | `NO_WAITING_ENTRIES` |

The `RESOURCE_NOT_FOUND` code is deliberately used for customer cross-owner lookup to avoid revealing whether that resource exists. A 404 is never used for unauthenticated requests. A 403 is never used to mask the privacy violation in the customer case.

## 8. Assumptions & Architectural Decisions

| ID | Topic | Final decision | Rationale | Affected docs |
|---|---|---|---|---|
| AD-01 | Authentication strategy | Session-based authentication using HTTP-only cookies with CSRF protection | Better fit for browser-based app flow, server-side invalidation, and simple testing against a single backend | SRS, system-sds, API spec |
| AD-02 | Database concurrency | Queue number generation and update logic occur inside a PostgreSQL transaction using row-level locking on the target queue row | Prevents duplicate numbers when multiple join requests are processed simultaneously | SRS, system-sds, tests |
| AD-03 | Sprint 1 scope cut | Customer self-registration and password reset are excluded; seed data initializes required test users and queues | Keeps Sprint 1 focused on the required vertical slice and avoids unsupported user-management features | SRS, features, API spec |
| AD-04 | Queue numbering | Positive integer queue numbers are unique within a service queue and never reset during Sprint 1 | Simple, testable, deterministic numbering without calendar or service-day complexity | SRS, system-sds, tests |
| AD-05 | Queue availability | `OPEN` / `CLOSED`; CLOSED queues reject new joins but existing entries may still be completed by assigned operators | Matches service-delivery needs without adding scheduling logic | SRS, system-sds, API spec |
| AD-06 | Duplicate prevention & active entry cap | At most one active entry per customer per queue (BR-05) and at most 2 active entries across all queues simultaneously (BR-06); entries that are not active (`COMPLETED`, `CANCELLED`, `NO_SHOW`) release a slot | Prevents same-queue double-booking and cross-queue hoarding while allowing fresh entries after completion (Updated 2026-11-27, Issue #51) | SRS, Feature SDS, system-sds, API spec, tests |
| AD-07 | Customer privacy | Return `404 RESOURCE_NOT_FOUND` for cross-owner lookups, matching the public behavior of a missing entry | Prevents leakage of private information through resource enumeration | SRS, API spec, tests |
| AD-08 | Operator permissions | Operators may only act on queues assigned to them | Ensures service workflow is scoped to real operational responsibility | SRS, system-sds, API spec |

## 9. Scope and Delivery Contract

This SRS is the authoritative Sprint 1 engineering contract for the queue-management workflow. It is aligned with the required course deliverable structure and is intentionally limited to documentation and analysis. No source code, database schema, API handlers, UI components, or deployment configuration are implemented in this branch.

The primary documentation set is:
- [srs.md](./srs.md)
- [features.md](./features.md)
- [traceability.md](./traceability.md)
- [system-sds.md](./system-sds.md)
- [sprints/plan.md](./sprints/plan.md)
- [sprints/sprint-1/api-spec.md](./sprints/sprint-1/api-spec.md)
- [sprints/sprint-1/ui-spec.md](./sprints/sprint-1/ui-spec.md)
- [sprints/sprint-1/tests.md](./sprints/sprint-1/tests.md)
- [features/sprint-2-f07-customer-cancellation.md](./features/sprint-2-f07-customer-cancellation.md) (rev. 2.0)
- [sprints/sprint-2/api-spec.md](./sprints/sprint-2/api-spec.md), [sprints/sprint-2/ui-spec.md](./sprints/sprint-2/ui-spec.md), [sprints/sprint-2/tests.md](./sprints/sprint-2/tests.md) (rev. 2.0)
- [features/sprint-2-f08-no-show-recovery.md](./features/sprint-2-f08-no-show-recovery.md) (rev. 3.0)
- [features/sprint-2-f09-multi-counter.md](./features/sprint-2-f09-multi-counter.md) (rev. 4.0)

*Rev. 2.0 note:* the paragraph above describes the Sprint 1 documentation branch and is kept as written. From rev. 2.0 this SRS is also the contract for Sprint 2 feature F-07.

## 10. Acceptance criteria (Sprint 2, F-07)

Sprint 1 acceptance criteria AC-01–AC-16 are referenced from §4 and mapped to tests in [traceability.md](./traceability.md). The F-07 criteria continue that numbering. Each one can be observed through the API, the database or the browser. Test mapping: [sprints/sprint-2/tests.md](./sprints/sprint-2/tests.md).

| AC | Requirement / rule | Acceptance criterion |
|---|---|---|
| AC-17 | FR-14, BR-14, FR-07, FR-13 | **Given** a signed-in customer who owns a `WAITING` entry, **when** they send `POST /api/me/queue-entries/{entryId}/cancel` with a valid CSRF token, **then** the response is `200` with `status` `CANCELLED`, a non-null RFC 3339 UTC `cancelledAt`, `aheadCount` `0` and the unchanged `queueNumber`; the database row holds the same values; and a fresh `GET /api/me/queue-entries` or `GET /api/me/queue-entries/{entryId}` still returns the entry as `CANCELLED`. |
| AC-18 | BR-13, BR-09 | **Given** the customer's own entry is `CALLED`, `SERVING`, `COMPLETED` or already `CANCELLED`, **when** they request cancellation, **then** the response is `409 INVALID_STATE_TRANSITION` and the row (status and all timestamps) is unchanged. |
| AC-19 | BR-13, BR-07, NFR-02, NFR-08 | **Given** an existing `WAITING` entry owned by customer 1: **when** customer 2 requests cancellation, **then** the response is `404 RESOURCE_NOT_FOUND`; **when** an operator requests it, **then** `403 FORBIDDEN`; **when** no session is sent, **then** `401 UNAUTHORIZED`; **when** the CSRF header is missing or wrong, **then** `403 FORBIDDEN`. In each of these cases the entry stays `WAITING` with `cancelledAt` `NULL`. A malformed `entryId` returns `400 INVALID_ARGUMENT`; an unknown valid UUID returns `404 RESOURCE_NOT_FOUND`. |
| AC-20 | BR-13 | **Given** the customer's `WAITING` entry belongs to a queue that is now `CLOSED`, **when** they cancel it, **then** the response is `200` and the entry is `CANCELLED`. |
| AC-21 | BR-05 (rev.), BR-02, BR-04, BR-12 | **Given** a customer cancelled their entry with queue number N in queue Q, **when** they join Q again, **then** the response is `201` with a new `WAITING` entry whose number is greater than N, and the cancelled row still exists with number N. A second active entry for the same customer and queue is still rejected (API `409 DUPLICATE_ACTIVE_ENTRY`; database partial unique index, whose definition is unchanged). |
| AC-22 | BR-14, BR-01, BR-10, FR-08, FR-09 | **Given** queue Q has `WAITING` entries A, B, C in FIFO order and B is cancelled, **when** the assigned operator calls next twice, **then** A and then C are called and B stays `CANCELLED`. B is absent from `GET /api/operator/queues/{queueId}/entries`, and C's `aheadCount` drops by one when B is cancelled. **When** the only `WAITING` entry of a queue has been cancelled, Call Next returns `204` with no state change. |
| AC-23 | BR-14, BR-12, NFR-03, NFR-05 | **Given** one `WAITING` entry, **when** a cancel and a Call Next for it are sent in parallel (repeated at least 10 times), **then** in every round exactly one transition is applied to that entry. Either the cancel returns `200` and the entry is `CANCELLED` with `calledAt` `NULL`, or the Call Next returns `200` for it, the entry is `CALLED` with `cancelledAt` `NULL`, and the cancel returns `409` (`INVALID_STATE_TRANSITION` or `CONCURRENT_MODIFICATION`). Two parallel cancels of one entry give exactly one `200` and one `409`. |
| AC-24 | FR-14, NFR-06, NFR-08 | **Given** the customer views their own entry at `/customer/entries/:id`: a "Leave queue" button is shown only while the entry is `WAITING`; selecting it asks for confirmation before any request is sent; while the request runs, the control is disabled and shows "Leaving queue..."; on success the page shows the status "Cancelled" and a "Cancelled:" time without a reload, and shows the same after a reload; on `409`, `404` or `403` a message appears next to the control; the flow works with the keyboard alone; and the page has no horizontal overflow at 360 px and 1280 px. |

### 10.1 Acceptance criteria (Sprint 2, F-08, rev. 3.0)

The F-08 criteria continue the numbering. "Unchanged" means the row's `status`, `calledAt`, `serviceStartedAt`, `completedAt`, `cancelledAt`, `noShowAt`, `recoveredAt` and `noShowCount` are the same before and after the request. Test mapping: [sprints/sprint-2/tests.md §7](./sprints/sprint-2/tests.md#7-f-08-no-show-handling-and-recovery).

| AC | Requirement / rule | Acceptance criterion |
|---|---|---|
| AC-25 | FR-15, BR-15, BR-17, FR-13 | **Given** an operator assigned to queue Q and a `CALLED` entry in Q, **when** they send `POST /api/operator/queue-entries/{entryId}/no-show` with a valid CSRF token, **then** the response is `200` with `status` `NO_SHOW`, a non-null RFC 3339 UTC `noShowAt` not earlier than `calledAt`, `noShowCount` `1`, `recoveredAt` `null` and the unchanged `queueNumber`, `joinedAt` and `calledAt`; the database row holds the same values; the customer's `GET /api/me/queue-entries/{entryId}` returns `NO_SHOW` with `aheadCount` `0`. The same holds when Q is `CLOSED`. |
| AC-26 | BR-15, BR-09 | **Given** an entry in Q that is `WAITING`, `SERVING`, `COMPLETED`, `CANCELLED` or already `NO_SHOW`, **when** the assigned operator marks it no-show, **then** the response is `409 INVALID_STATE_TRANSITION` and the row is unchanged. |
| AC-27 | BR-15, BR-16, BR-07, FR-03, NFR-02, NFR-08 | For both `POST .../no-show` (on a `CALLED` entry) and `POST .../recover` (on a `NO_SHOW` entry): an operator not assigned to the entry's queue gets `403 FORBIDDEN`; a customer, including the entry's owner, gets `403 FORBIDDEN`; no session gets `401 UNAUTHORIZED`; a missing or wrong CSRF header gets `403 FORBIDDEN`; a malformed `entryId` gets `400 INVALID_ARGUMENT`; an unknown valid UUID gets `404 RESOURCE_NOT_FOUND`. In every case the row is unchanged. |
| AC-28 | FR-16, BR-16, BR-01, BR-17 | **Given** queue Q with entries A, B, C (joined in that order), A called and marked `NO_SHOW`, then B called, **when** the assigned operator sends `POST /api/operator/queue-entries/{A}/recover`, **then** the response is `200` with A `WAITING`, `calledAt` `null`, a non-null UTC `recoveredAt`, `noShowCount` `1`, `noShowAt` kept, and the original `joinedAt` and queue number; C's `aheadCount` goes up by one; and the next Call Next calls A before C. The same holds when Q is `CLOSED`. |
| AC-29 | BR-16, BR-17, BR-12 | **Given** entry A was returned once, then called and marked `NO_SHOW` again (`noShowCount` 2), **when** the assigned operator tries to return it, **then** the response is `409 RECOVERY_LIMIT_REACHED` and the row is unchanged. Returning an entry that is `WAITING`, `CALLED`, `SERVING`, `COMPLETED` or `CANCELLED` gives `409 INVALID_STATE_TRANSITION`. The database rejects a `noShowCount` outside 0–2. |
| AC-30 | BR-05 (rev. 3.0), BR-16, BR-13 | **Given** the customer's entry A in Q is `NO_SHOW`, **when** the customer joins Q, **then** the response is `201` with a new `WAITING` entry with a larger number; **when** the operator then tries to return A, **then** the response is `409 DUPLICATE_ACTIVE_ENTRY` and A is unchanged. The customer cannot cancel a `NO_SHOW` entry (`409 INVALID_STATE_TRANSITION`), but can cancel A after it has been returned to `WAITING` (`200`, F-07). |
| AC-31 | BR-17, BR-01, BR-10, FR-08, FR-09 | **Given** Q's only other entries are `NO_SHOW`, **when** the operator calls next, **then** the response is `204` and no `NO_SHOW` entry changes. `GET /api/operator/queues/{queueId}/entries` includes `NO_SHOW` entries in FIFO order with `noShowAt`, `noShowCount` and `recoveredAt`; a `NO_SHOW` entry is not counted in any other entry's `aheadCount`. |
| AC-32 | BR-12, BR-15, BR-16, NFR-03, NFR-05 | Repeated at least 10 times each: (a) a no-show and a Start Service for the same `CALLED` entry in parallel give exactly one `200` and one `409 INVALID_STATE_TRANSITION`, and the row is either `NO_SHOW` with `serviceStartedAt` `NULL` or `SERVING` with `noShowAt` `NULL`; (b) two parallel returns of the same `NO_SHOW` entry give exactly one `200` and one `409`; (c) a return of the customer's `NO_SHOW` entry and a join by the same customer to the same queue in parallel never leave two active entries for that customer and queue: either the return is `200` and the join `409 DUPLICATE_ACTIVE_ENTRY`, or the join is `201` and the return `409 DUPLICATE_ACTIVE_ENTRY`. |
| AC-33 | FR-15, FR-16, NFR-06, NFR-08 | **Given** the assigned operator views `/operator/queues/:id`: a "Mark no-show" button is shown only for `CALLED` entries; after it succeeds the entry appears in a "No-show" section with the status "No-show" and a "Missed:" time, without a reload; a "Return to queue" button is shown there only while `noShowCount` is 1, and after it succeeds the entry is back in the waiting list at its FIFO position; an entry with `noShowCount` 2 shows "Already returned once" and no button; while a request runs the button is disabled and shows a busy text; on `409` a message is shown and the list is refreshed; the flow works with the keyboard alone; and the page has no horizontal overflow at 360 px and 1280 px. |
| AC-34 | FR-07, BR-17, NFR-08 | **Given** the customer views their own entry at `/customer/entries/:id` and it is `NO_SHOW`: the page shows the status "No-show", a "Missed:" time and, while it can still be returned, the message "You missed your turn. If you are still here, please go to the counter. Staff can return you to the queue once."; when it can no longer be returned, the message "You missed your turn again, so this entry is closed. You can join the queue again." and polling stops. After a return the page shows "Waiting", a "Returned to queue:" time and the Leave queue button. |

### 10.2 Acceptance criteria (Sprint 2, F-09, rev. 4.0)

The F-09 criteria continue the numbering. "Unchanged" means all persisted fields of the target `Counter` and `QueueEntry` rows are identical before and after the request. Test mapping: [sprints/sprint-2/tests.md §8](./sprints/sprint-2/tests.md#8-f-09-multi-counter-support).

| AC | Requirement / rule | Acceptance criterion |
|---|---|---|
| AC-35 | FR-17, BR-18, NFR-08 | **Given** an operator assigned to queue Q, **when** they request `GET /api/operator/queues/{queueId}/counters`, **then** the response is `200 OK` with `data.counters` ordered deterministically by `name ASC, id ASC`, each containing `id`, `serviceQueueId`, `name`, `status` (`OPEN` or `CLOSED`), `assignedOperatorId`, `createdAt`, and `updatedAt`. For seeded General Inquiry Desk, `Counter 1` (`OPEN`) and `Counter 2` (`OPEN`) are returned. |
| AC-36 | FR-17, BR-18, NFR-05 | **Given** an assigned operator and a counter C in queue Q, **when** they send `PATCH /api/operator/counters/{counterId}/status` with `{"status":"CLOSED"}` (or `{"status":"OPEN"}`) and a valid CSRF token, **then** the response is `200 OK` with the updated `Counter` persisted in PostgreSQL; setting the same status again returns `200 OK`; and the action succeeds even if Q is `CLOSED`. Missing, non-string, unknown, or malformed status payloads return `400 INVALID_ARGUMENT` with no database change. |
| AC-37 | FR-17, FR-18, BR-18, BR-07, FR-03, NFR-02, NFR-08 | Across `GET /api/operator/queues/{queueId}/counters`, `PATCH /api/operator/counters/{counterId}/status`, and `POST /api/operator/counters/{counterId}/call-next`: no session gets `401 UNAUTHORIZED`; a `CUSTOMER` gets `403 FORBIDDEN`; an unassigned `OPERATOR` gets `403 FORBIDDEN`; an assigned `OPERATOR` who does not match a non-null `Counter.assignedOperatorId` gets `403 FORBIDDEN`; missing or wrong `X-CSRF-Token` on `PATCH`/`POST` gets `403 FORBIDDEN`; malformed UUID params get `400 INVALID_ARGUMENT`; unknown valid UUIDv4 `counterId` gets `404 RESOURCE_NOT_FOUND` (unknown `queueId` on `GET .../counters` gets `403 FORBIDDEN` via queue-assignment enforcement). In every case no database row changes. |
| AC-38 | FR-18, FR-19, BR-19, BR-20, BR-01, FR-13 | **Given** queue Q with `WAITING` entries A, B in FIFO order and `OPEN` counters C1, C2: **when** the assigned operator sends `POST /api/operator/counters/{C1}/call-next` and then `POST /api/operator/counters/{C2}/call-next`, **then** C1 claims A (`200`, `status: CALLED`, RFC 3339 UTC `calledAt`, `counterId: C1.id`, `counterName: C1.name`) and C2 claims B (`200`, `counterId: C2.id`, `counterName: C2.name`); the database rows match; `GET /api/me/queue-entries/{A}`, `GET /api/me/queue-entries`, and `GET /api/operator/queues/{Q}/entries` all return `counterId` and `counterName`. The same holds when Q is `CLOSED`. |
| AC-39 | FR-18, BR-19, BR-10 | (a) Sending `POST /api/operator/counters/{C}/call-next` when counter C is `CLOSED` returns `409 COUNTER_CLOSED` and leaves all `WAITING` entries unchanged; entries already `CALLED` or `SERVING` at C retain their `counterId` and can still be started, completed, or marked no-show. (b) Sending `POST /api/operator/counters/{C}/call-next` when C is `OPEN` and no `WAITING` entry exists returns `409 NO_WAITING_ENTRIES` with no state change. (c) Legacy `POST /api/operator/queues/{Q}/call-next` remains functional with `counterId: null`, `counterName: null`, and `204 No Content` when empty. |
| AC-40 | FR-18, BR-19, BR-12, NFR-03, NFR-05 | Repeated at least 15 times each: (a) parallel `POST .../counters/{C1}/call-next` and `POST .../counters/{C2}/call-next` on a queue with 2 `WAITING` entries `{A, B}` claim two distinct entries `{A, B}` with zero double-claims and zero lost updates (deterministic FIFO ordering is verified sequentially in AC-38), and on a queue with exactly 1 `WAITING` entry yield one `200` and one `409 NO_WAITING_ENTRIES`; (b) parallel `POST .../counters/{C1}/call-next` and `PATCH .../counters/{C1}/status` (`CLOSED`) serialize cleanly on the `Counter` lock with zero deadlocks—either Call Next returns `200` before close or close commits first and Call Next returns `409 COUNTER_CLOSED`. |
| AC-41 | FR-18, BR-20, BR-16, BR-14 | (a) Recovering a `NO_SHOW` entry that had been called at C1 sets `status: WAITING`, `calledAt: null`, `counterId: null`, `counterName: null`; calling it again at C2 records `counterId: C2.id`, `counterName: C2.name`. (b) `WAITING` and `CANCELLED` entries always have `counterId: null`, `counterName: null`; counter Call Next skips `CANCELLED` and `NO_SHOW` entries. (c) PostgreSQL enforces unique `(serviceQueueId, name)` on `Counter` and composite FK `FOREIGN KEY ("counterId", "serviceQueueId") REFERENCES "Counter"("id", "serviceQueueId")` (`MATCH SIMPLE`) rejecting both unknown `counterId` and a valid `counterId` from a different `serviceQueueId` while allowing `counterId IS NULL`. |
| AC-42 | FR-17, FR-18, FR-19, NFR-06, NFR-08 | **Given** an assigned operator views `/operator/queues/:id`: a Counters section lists each counter with its `Open`/`Closed` badge (text + icon), an Open/Close toggle button, and a counter-scoped **Call Next** button disabled when `CLOSED`; counters where `assignedOperatorId` belongs to another operator disable both controls and show `"Assigned to another operator"`; the legacy queue-level Call Next fallback is shown whenever the operator has zero usable counters in the queue; counter badges on entries are rendered on `CALLED` and `SERVING` entries only (never on `WAITING`, `COMPLETED`, `NO_SHOW`, or `CANCELLED`); busy text, live announcements, and user-safe error messages (`COUNTER_CLOSED`, `NO_WAITING_ENTRIES`) are shown with list refresh on `409`; keyboard-only operation succeeds; and there is no page-level horizontal overflow at 360 px and 1280 px. |
| AC-43 | FR-19, FR-07, NFR-06, NFR-08 | **Given** a customer views `/customer/entries/:id`: when `CALLED` with non-null `counterName`, the page displays the counter badge and `"Please proceed to {counterName}."`; when `SERVING` with non-null `counterName`, `"Your service is in progress at {counterName}."`; when `counterName` is `null`, the existing Sprint 1 text (`"Please go to the service desk."` / `"Your service is in progress."`) is shown; no counter badge is rendered for `WAITING`, `COMPLETED`, `NO_SHOW`, or `CANCELLED`. On `/customer` My Active Tickets, counter badges are rendered on `CALLED` and `SERVING` entries only when `counterName` is non-null. Both pages have no horizontal overflow at 360 px and 1280 px. |
| AC-44 | FR-17–FR-19, NFR-04, NFR-07 | Running `seed()` idempotently creates deterministic default counters (`Counter 1`, `Counter 2`, `OPEN`) for each seeded queue without duplicating rows or overwriting toggled counter `status` on re-seed; NFR-04 latency targets are verified for the new F-09 read and mutation paths (`PERF-S2-003`); and all Sprint 1, F-07, and F-08 tests pass unchanged (`REG-S2-003`). |

## 11. Revision history

| Version | Date | Section | Previous text (kept for the record) | New text / reason |
|---|---|---|---|---|
| 2.0 | 2026-11-27 | §3 CUSTOMER row | "login/logout, list OPEN queues, join an OPEN queue, read own entry" | Adds "cancel own `WAITING` entry" (F-07). |
| 2.0 | 2026-11-27 | §5 BR-05 decision | "Completed entries may be rejoined; no cancellation/no-show behavior is in scope" | Completed **and cancelled** entries are not active and may be rejoined with a new number; no-show is still out of scope. Reason: F-07 introduces `CANCELLED`. |
| 2.0 | 2026-11-27 | §5 BR-09 | Rule: "Valid lifecycle is `WAITING -> CALLED -> SERVING -> COMPLETED`"; decision: "No alternate transitions or repeats are allowed" | Adds the single alternate edge `WAITING -> CANCELLED` by the owning customer; `CANCELLED` is terminal. Reason: F-07. |
| 2.0 | 2026-11-27 | §5 | — | Adds BR-13 (who may cancel, and from which state) and BR-14 (terminal `CANCELLED`, history, eligibility). |
| 2.0 | 2026-11-27 | §4 | — | Adds FR-14. |
| 2.0 | 2026-11-27 | §5 transition table, §7 | — | Adds the `WAITING → CANCELLED` row and the two cancel error rows. |
| 2.0 | 2026-11-27 | §1, §1.1, §9, §10 | §1 and §9 text unchanged | Adds the Sprint 2 scope note, §1.1, the Sprint 2 document links and the F-07 acceptance criteria. No NFR is added: NFR-02, NFR-03, NFR-05, NFR-06 and NFR-08 apply to the new behavior as written. NFR-04 also applies but is not re-measured in F-07. |
| 2.0.1 | 2026-11-27 | §11 (row above), NFR-04 | "NFR-04 also applies but is not re-measured in F-07." | NFR-04 applies to the cancel mutation as written (it is a mutation on the seeded 1,000-entry dataset) and is now measured by PERF-S2-001 (`server/tests/nfr/perf-s2-001-cancel.ts`) with the same method and targets as PERF-001. The NFR-04 text and targets are unchanged. Reason: review of PR #56. |
| 3.0 | 2026-11-27 | §3 OPERATOR row | "login/logout, view assigned queues, view queue entries, call next, start, complete" | Adds "mark a `CALLED` entry no-show, return a `NO_SHOW` entry to the queue" (F-08). |
| 3.0 | 2026-11-27 | §5 BR-05 decision | Rev. 2.0 text: "`COMPLETED` and `CANCELLED` entries are not active, so the customer may join that queue again and receives a new, larger queue number (BR-02, BR-04). No-show behavior is not in scope. The database partial unique index is unchanged." | `NO_SHOW` is also not active; returning a `NO_SHOW` entry is rejected while another active entry exists. Reason: F-08. |
| 3.0 | 2026-11-27 | §5 BR-09 | Rev. 2.0 rule: "Valid lifecycle is `WAITING -> CALLED -> SERVING -> COMPLETED`, plus `WAITING -> CANCELLED` by the owning customer"; decision: "No other alternate transitions or repeats are allowed. `COMPLETED` and `CANCELLED` are terminal." | Adds `CALLED -> NO_SHOW` and `NO_SHOW -> WAITING` (once) by an assigned operator; `NO_SHOW` with `noShowCount` 2 is final. Reason: F-08. |
| 3.0 | 2026-11-27 | §4, §5 | — | Adds FR-15, FR-16, BR-15, BR-16, BR-17. |
| 3.0 | 2026-11-27 | §5 transition table, §7 | — | Adds the `CALLED → NO_SHOW` and `NO_SHOW → WAITING` rows and three error rows, including the new code `RECOVERY_LIMIT_REACHED`. |
| 3.0 | 2026-11-27 | §1, §1.1, §1.2, §9, §10.1 | §1 rev. 2.0 note and the §1.1 "Still excluded" item kept as written, with a rev. 3.0 note added | Adds §1.2, the F-08 document link and AC-25–AC-34. No NFR is added. NFR-02, NFR-03, NFR-04, NFR-05, NFR-06 and NFR-08 apply to the new behavior as written; NFR-04 is measured for the two new mutations by PERF-S2-002. |
| 4.0 | 2026-11-27 | §3 OPERATOR row | "login/logout, view assigned queues, view queue entries, call next, start, complete, mark a `CALLED` entry no-show, return a `NO_SHOW` entry to the queue (rev. 3.0)" / "must be assigned to the target queue" | Adds listing queue counters, opening/closing counters, and calling next for an `OPEN` counter, plus `Counter.assignedOperatorId` enforcement when set (F-09). |
| 4.0 | 2026-11-27 | §5 BR-10 decision | "Defines the empty-queue case without raising a workflow error" | Notes that legacy queue-level Call Next keeps `204 No Content`, while counter-scoped Call Next returns `409 NO_WAITING_ENTRIES` (BR-19). Reason: F-09. |
| 4.0 | 2026-11-27 | §5 BR-16 rule & decision | Rev. 3.0 text cleared only `calledAt` on recovery | Notes that recovery also clears `counterId` to `NULL` so returned `WAITING` rows hold no stale counter reference (BR-20). Reason: F-09. |
| 4.0 | 2026-11-27 | §4, §5 | — | Adds FR-17, FR-18, FR-19, BR-18, BR-19, BR-20. |
| 4.0 | 2026-11-27 | §5 transition table, §7 | — | Updates `WAITING → CALLED` and `NO_SHOW → WAITING`, adds `Counter OPEN ↔ CLOSED`, and adds error codes `COUNTER_CLOSED` and `NO_WAITING_ENTRIES`. |
| 4.0 | 2026-11-27 | §1, §1.2, §1.3, §9, §10.2 | §1 rev. 3.0 note and §1.2 "Still excluded" item kept as written, with a rev. 4.0 note added | Adds §1.3, the F-09 document link and AC-35–AC-44. No NFR is added; NFR-02–NFR-08 apply and NFR-04 is planned via PERF-S2-003. |
| 4.1 | 2026-11-27 | §5 BR-19, BR-20; §10.2 AC-40–AC-43 | Rev. 4.0 BR-19 did not state the legacy Call Next backwards-compatibility trade-off; BR-20 used a single-column `ON DELETE SET NULL` FK; AC-40(a) said "in FIFO order" for parallel calls; AC-42/AC-43 did not specify disabled other-operator controls, 0-usable-counter fallback, or strict `CALLED`/`SERVING`-only badge rules. | Contract v1.1 review fixes (@TeekhathatTT): scopes BR-19 to counter Call Next and records legacy Call Next as an accepted backwards-compatibility trade-off writing `counterId = NULL`; upgrades BR-20 and AC-41(c) to composite FK `("counterId", "serviceQueueId") -> Counter("id", "serviceQueueId")` (`MATCH SIMPLE`); rewords AC-40(a) for parallel `SKIP LOCKED`; tightens AC-42 and AC-43 UI rules. |
| 1.1 | 2026-11-27 | §5 BR-06, FR-12, AD-06, §7 | BR-06: "A customer may join multiple queues at the same time, but only one active entry per customer per queue" | Lab 7 (issue #51): at most 2 active entries per customer across all queues; the third join gets `409 MAX_ACTIVE_ENTRIES_REACHED`; BR-05 still takes precedence. Approved and released on `main` (`1f34952`, revision `qms-00006-6bj`). |
| 4.2 | 2026-11-27 | Document control, §5 BR-06, §8 AD-06 | BR-06 / AD-06 (rev. 1.1): "Terminal entries (`COMPLETED`, and future `CANCELLED`/`NO_SHOW`) ..." | Rev. 1.1 merged into the Sprint 2 line; `CANCELLED` and `NO_SHOW` exist now, so the "future" wording is replaced. **Open:** BR-16 (return a `NO_SHOW` entry to the queue) does not yet check the BR-06 cap, so a recovery can leave a customer with 3 active entries. A decision and a test are needed before the Sprint 2 release. |
