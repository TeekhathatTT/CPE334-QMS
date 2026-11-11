# Software Requirements Specification (SRS)

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

## 2. Concrete Stakeholder Problem

Customers often stand near the service counter waiting for attention, but they cannot reliably tell how many people are ahead of them or how long they may still have to wait. When queue information is unclear or the calling process is inconsistent, customers may hesitate to leave the waiting area because they fear missing their turn, and they may become frustrated and lose confidence in the service experience. This is especially disruptive in busy service environments where the waiting line is not visible to everyone and where customers are expected to remain nearby while they wait.

Operators must often manage queues manually or by informal communication, and they can easily become confused about serving order. A queue may be skipped, called incorrectly, or processed in a conflicting order when multiple customers believe they are next. Without a reliable shared record of queue state, operators can accidentally call the wrong person and create a dispute or service delay. The organization therefore lacks a consistent way to coordinate customer flow and maintain trust in the service process.

For management, inconsistent queue handling reduces customer confidence and weakens the quality of service. Without reliable queue records it is difficult to measure waiting time and service time, identify bottlenecks, or assess whether staffing and service processes are working effectively. A centralized queue management system is needed to provide a single, auditable source of truth for queue state, clear customer communication, and disciplined operator action.

## 3. Actors and Permissions

| Actor | Allowed | Enforcement |
|---|---|---|
| Anonymous | login only | no access to protected endpoints |
| CUSTOMER | login/logout, list OPEN queues, join an OPEN queue, read own entry | no operator actions, no access to other customers' private entries |
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

## 5. Business Rules and Decisions

| ID | Rule | Decision and rationale |
|---|---|---|
| BR-01 | FIFO processing by `(joinedAt ASC, id ASC)` with eligible status `WAITING` | Stable ordering without priority; required for operator call-next behavior |
| BR-02 | Queue numbers are positive integers scoped to a single service queue | Avoids collisions across different queues; numbers are unique within one queue during the queue lifecycle |
| BR-03 | Number generation is protected at the database layer using a transactional row lock | Prevents duplicate numbers under concurrent join requests; application pre-checks are insufficient alone |
| BR-04 | Queue numbers do not automatically reset in Sprint 1 | Keeps the queue-number contract deterministic and avoids service-day ambiguity |
| BR-05 | One active entry per customer per queue; active = `WAITING`, `CALLED`, `SERVING` | Completed entries may be rejoined; no cancellation/no-show behavior is in scope |
| BR-06 | A customer may join multiple queues at the same time, but only one active entry per customer per queue | Queues are independent and distinct service flows |
| BR-07 | One queue entry belongs to one customer and one queue; customer reads are self-scoped and operators scope through assigned queues | Prevents cross-customer and cross-queue leakage |
| BR-08 | Queue availability is `OPEN` or `CLOSED`; only `OPEN` queues appear in the customer join catalog | Makes availability testable and consistent with the queuing workflow |
| BR-09 | Valid lifecycle is `WAITING -> CALLED -> SERVING -> COMPLETED` | No alternate transitions or repeats are allowed |
| BR-10 | `Call Next` on an empty queue returns `204 No Content` and performs no state change | Defines the empty-queue case without raising a workflow error |
| BR-11 | Lifecycle timestamps are server-generated UTC values written atomically with the status change | Ensures consistent history and testability |
| BR-12 | Transactions and database constraints enforce uniqueness and state invariants | Reduces race conditions and guarantees consistent results |

### Transition table

| From → To | Actor / operation | Timestamp | Invalid action |
|---|---|---|---|
| New → WAITING | Customer joins OPEN queue | `joinedAt` | Reject invalid or closed joins |
| WAITING → CALLED | Assigned operator calls next | `calledAt` | Reject with `409 INVALID_STATE_TRANSITION` |
| CALLED → SERVING | Assigned operator starts service | `serviceStartedAt` | Reject with `409 INVALID_STATE_TRANSITION` |
| SERVING → COMPLETED | Assigned operator completes service | `completedAt` | Reject with `409 INVALID_STATE_TRANSITION` |

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