# Software Requirements Specification (SRS)

## Document control

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-08 | Team | Sprint 1 baseline (FR-01–FR-13, BR-01–BR-12, NFR-01–NFR-08, AC-01–AC-16) |
| 2.0 | 2026-11-27 | @TeekhathatTT (review: @Khwanklao, pending) | Sprint 2 F-07 contract v1: adds FR-14, BR-13, BR-14, AC-17–AC-24, §1.1 and §10; revises BR-05, BR-09, the CUSTOMER permission row and the transition table. The old text is kept in §11 Revision history. |

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

### 1.1 Sprint 2 additions (rev. 2.0)

F-07 (Customer cancellation and queue withdrawal, Issue #40) adds to Sprint 2:
- a customer may cancel their own `WAITING` entry; the entry becomes the terminal status `CANCELLED` with a server-generated `cancelledAt` time and is kept for history
- a cancelled entry is not active, so the customer may join the same queue again and receives a new queue number

Still excluded after rev. 2.0:
- leaving a `CALLED` or `SERVING` entry, and no-show handling (F-08)
- operator-initiated cancellation, and reinstating a cancelled entry
- multiple counters, priority queues, analytics and appointment booking (F-09–F-12)

Feature design: [features/sprint-2-f07-customer-cancellation.md](./features/sprint-2-f07-customer-cancellation.md).

## 2. Concrete Stakeholder Problem

Customers often stand near the service counter waiting for attention, but they cannot reliably tell how many people are ahead of them or how long they may still have to wait. When queue information is unclear or the calling process is inconsistent, customers may hesitate to leave the waiting area because they fear missing their turn, and they may become frustrated and lose confidence in the service experience. This is especially disruptive in busy service environments where the waiting line is not visible to everyone and where customers are expected to remain nearby while they wait.

Operators must often manage queues manually or by informal communication, and they can easily become confused about serving order. A queue may be skipped, called incorrectly, or processed in a conflicting order when multiple customers believe they are next. Without a reliable shared record of queue state, operators can accidentally call the wrong person and create a dispute or service delay. The organization therefore lacks a consistent way to coordinate customer flow and maintain trust in the service process.

For management, inconsistent queue handling reduces customer confidence and weakens the quality of service. Without reliable queue records it is difficult to measure waiting time and service time, identify bottlenecks, or assess whether staffing and service processes are working effectively. A centralized queue management system is needed to provide a single, auditable source of truth for queue state, clear customer communication, and disciplined operator action.

## 3. Actors and Permissions

| Actor | Allowed | Enforcement |
|---|---|---|
| Anonymous | login only | no access to protected endpoints |
| CUSTOMER | login/logout, list OPEN queues, join an OPEN queue, read own entry, cancel own `WAITING` entry (rev. 2.0) | no operator actions, no access to other customers' private entries |
| OPERATOR | login/logout, view assigned queues, view queue entries, call next, start, complete | must be assigned to the target queue |
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
| FR-12 | Reject malformed data, duplicate active joins, closed queues, invalid state transitions, and stale concurrent mutations through the API error contract. | All | M | AC-07, AC-13, AC-16 |
| FR-13 | Record server-generated UTC lifecycle timestamps and preserve completed entries for historical review. | System | M | AC-08, AC-15 |
| FR-14 | Let a customer cancel (withdraw) their own `WAITING` queue entry. The entry becomes `CANCELLED`, `cancelledAt` is recorded, and the row is kept and stays visible in the customer's own entry reads. Requests from other customers, other roles, or for entries in any other status are rejected through the API error contract. (Sprint 2, F-07, rev. 2.0) | CUSTOMER | M | AC-17–AC-24 |

## 5. Business Rules and Decisions

| ID | Rule | Decision and rationale |
|---|---|---|
| BR-01 | FIFO processing by `(joinedAt ASC, id ASC)` with eligible status `WAITING` | Stable ordering without priority; required for operator call-next behavior |
| BR-02 | Queue numbers are positive integers scoped to a single service queue | Avoids collisions across different queues; numbers are unique within one queue during the queue lifecycle |
| BR-03 | Number generation is protected at the database layer using a transactional row lock | Prevents duplicate numbers under concurrent join requests; application pre-checks are insufficient alone |
| BR-04 | Queue numbers do not automatically reset in Sprint 1 | Keeps the queue-number contract deterministic and avoids service-day ambiguity |
| BR-05 | One active entry per customer per queue; active = `WAITING`, `CALLED`, `SERVING` | **Rev. 2.0:** `COMPLETED` and `CANCELLED` entries are not active, so the customer may join that queue again and receives a new, larger queue number (BR-02, BR-04). No-show behavior is not in scope. The database partial unique index is unchanged. (Sprint 1 text in §11.) |
| BR-06 | A customer may join multiple queues at the same time, but only one active entry per customer per queue | Queues are independent and distinct service flows |
| BR-07 | One queue entry belongs to one customer and one queue; customer reads are self-scoped and operators scope through assigned queues | Prevents cross-customer and cross-queue leakage |
| BR-08 | Queue availability is `OPEN` or `CLOSED`; only `OPEN` queues appear in the customer join catalog | Makes availability testable and consistent with the queuing workflow |
| BR-09 | Valid lifecycle is `WAITING -> CALLED -> SERVING -> COMPLETED`, plus `WAITING -> CANCELLED` by the owning customer (rev. 2.0) | No other alternate transitions or repeats are allowed. `COMPLETED` and `CANCELLED` are terminal. (Sprint 1 text in §11.) |
| BR-10 | `Call Next` on an empty queue returns `204 No Content` and performs no state change | Defines the empty-queue case without raising a workflow error |
| BR-11 | Lifecycle timestamps are server-generated UTC values written atomically with the status change | Ensures consistent history and testability |
| BR-12 | Transactions and database constraints enforce uniqueness and state invariants | Reduces race conditions and guarantees consistent results |
| BR-13 | Only the customer who owns an entry may cancel it, and only while it is `WAITING`. The queue's availability (`OPEN` or `CLOSED`) does not matter. Cancelling a `CALLED`, `SERVING`, `COMPLETED` or already `CANCELLED` entry is rejected with `409 INVALID_STATE_TRANSITION`; a repeated cancel is not an idempotent success. A non-owner receives `404 RESOURCE_NOT_FOUND`; a non-customer role receives `403 FORBIDDEN`. (rev. 2.0, F-07) | A customer must always be able to leave the line. A called customer who leaves is a no-show (F-08), and service in progress is the operator's to end. Privacy follows BR-07 / AD-07. |
| BR-14 | `CANCELLED` is a terminal status. The status change and the server-generated UTC `cancelledAt` are committed atomically in one conditional update. A cancelled row is never deleted, is never eligible for Call Next, keeps its queue number (never reused), is excluded from the operator entry list, and is not counted in any `aheadCount`. (rev. 2.0, F-07) | Keeps history (FR-13) and the FIFO rule (BR-01) intact, and makes cancel and Call Next mutually exclusive on the same entry (BR-12, NFR-03). |

### Transition table

| From → To | Actor / operation | Timestamp | Invalid action |
|---|---|---|---|
| New → WAITING | Customer joins OPEN queue | `joinedAt` | Reject invalid or closed joins |
| WAITING → CALLED | Assigned operator calls next | `calledAt` | Reject with `409 INVALID_STATE_TRANSITION` |
| CALLED → SERVING | Assigned operator starts service | `serviceStartedAt` | Reject with `409 INVALID_STATE_TRANSITION` |
| SERVING → COMPLETED | Assigned operator completes service | `completedAt` | Reject with `409 INVALID_STATE_TRANSITION` |
| WAITING → CANCELLED (rev. 2.0) | Owning customer cancels | `cancelledAt` | Any other source status: `409 INVALID_STATE_TRANSITION`; status changed during the request: `409 CONCURRENT_MODIFICATION` |

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
| Invalid payload or malformed identifier | 400 | `INVALID_ARGUMENT` |
| Empty queue on Call Next | 204 | No body |
| Customer cancels an entry that is not `WAITING` (rev. 2.0) | 409 | `INVALID_STATE_TRANSITION` |
| Entry changed by another request during a cancel (rev. 2.0) | 409 | `CONCURRENT_MODIFICATION` |

The `RESOURCE_NOT_FOUND` code is deliberately used for customer cross-owner lookup to avoid revealing whether that resource exists. A 404 is never used for unauthenticated requests. A 403 is never used to mask the privacy violation in the customer case.

## 8. Assumptions & Architectural Decisions

| ID | Topic | Final decision | Rationale | Affected docs |
|---|---|---|---|---|
| AD-01 | Authentication strategy | Session-based authentication using HTTP-only cookies with CSRF protection | Better fit for browser-based app flow, server-side invalidation, and simple testing against a single backend | SRS, system-sds, API spec |
| AD-02 | Database concurrency | Queue number generation and update logic occur inside a PostgreSQL transaction using row-level locking on the target queue row | Prevents duplicate numbers when multiple join requests are processed simultaneously | SRS, system-sds, tests |
| AD-03 | Sprint 1 scope cut | Customer self-registration and password reset are excluded; seed data initializes required test users and queues | Keeps Sprint 1 focused on the required vertical slice and avoids unsupported user-management features | SRS, features, API spec |
| AD-04 | Queue numbering | Positive integer queue numbers are unique within a service queue and never reset during Sprint 1 | Simple, testable, deterministic numbering without calendar or service-day complexity | SRS, system-sds, tests |
| AD-05 | Queue availability | `OPEN` / `CLOSED`; CLOSED queues reject new joins but existing entries may still be completed by assigned operators | Matches service-delivery needs without adding scheduling logic | SRS, system-sds, API spec |
| AD-06 | Duplicate prevention | One active entry per customer per queue; completed entries may be rejoined | Prevents double-booking while allowing a fresh entry after completion | SRS, system-sds, tests |
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