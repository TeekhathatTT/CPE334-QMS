# Queue and Service Management System (QMS) Specification

## 1. Purpose, objectives and boundary

QMS coordinates walk-in customers and service operators at a service counter or restaurant. It replaces informal queue coordination with persistent entries, private customer status and authorized operator actions. Sprint 1 delivers authentication and authorization, queue discovery, registration, queue numbering, customer status reads, FIFO operator processing, and automated workflow/access tests by 8 November 2026. The boundary is a browser client, HTTP API, relational storage and seed-based initial data. Local reproducibility is in scope; GCP deployment and completed Docker/CI/CD belong to Lab 5.

Included: Customer and Operator login/logout, role/queue authorization, available queue listing, join, own-entry details/status, operator queue/entry listing, call next, start and complete. Excluded: cancellation, no-show, multiple counters, priority, appointment booking, analytics, account self-registration, password reset, and other future-sprint behavior. Completed entries are terminal in Sprint 1.

## 2. Actors and permissions

| Actor | Allowed | Forbidden / enforcement |
|---|---|---|
| Unauthenticated | Login; public catalog only if configured | All personal and operator reads/mutations |
| CUSTOMER | Login/logout; list open queues; join; read own entry | Operator actions; another customer's private entry; operator management |
| OPERATOR | Login/logout; list assigned queues/entries; call/start/complete assigned queue entries | Any queue not assigned; customer join and self-service endpoints |
| Provisioning/seed | Create initial users, queues and assignments | Interactive runtime access; plaintext passwords |

The backend checks role, ownership and operator assignment on every request. Customer lookup of another customer's entry returns the same `404 RESOURCE_NOT_FOUND` as a nonexistent entry. An authenticated operator without assignment receives `403 FORBIDDEN`.

## 3. Functional requirements

Priority M means required in Sprint 1. ACs are in §8.

| ID | Requirement | Actor | Priority | AC |
|---|---|---|---|---|
| FR-01 | Authenticate active users by configured login identifier/password, establish server-validated session, and reject bad credentials generically. | Both roles | M | AC-01–02 |
| FR-02 | Return current user ID/role, support logout, and reject protected requests after logout/expiry. | Both roles | M | AC-01,03 |
| FR-03 | Enforce role permissions and check queue assignment on every operator action. | All | M | AC-03–05 |
| FR-04 | List only queues available for customer joining, with public name, description and availability. | CUSTOMER | M | AC-06 |
| FR-05 | Join an open queue, persist a WAITING entry and return its ID, number, queue name and join time. | CUSTOMER | M | AC-07–08 |
| FR-06 | Allocate numbers using BR-02/03's approved scope and concurrency-safe method. | System | M | AC-08–09 |
| FR-07 | Read only own entry details/status and relevant timestamps; omit other customers' identity/contact data. | CUSTOMER | M | AC-10 |
| FR-08 | List assigned queues and entries in deterministic join order; expose only service-required customer display data. | OPERATOR | M | AC-04,11 |
| FR-09 | Atomically call the oldest eligible WAITING entry; return defined empty result if none exists. | OPERATOR | M | AC-12–13 |
| FR-10 | Move a managed CALLED entry to SERVING. | OPERATOR | M | AC-14 |
| FR-11 | Move a managed SERVING entry to COMPLETED. | OPERATOR | M | AC-15 |
| FR-12 | Reject malformed IDs/input, duplicate joins, closed queues, invalid transitions and concurrent conflicts using the API error contract. | All | M | AC-07,13–16 |
| FR-13 | Record server-generated UTC lifecycle times and retain completed entries. | System | M | AC-15 |

## 4. Business rules and decisions

Issue prompt baseline is approved scope; other choices below are proposals, not approved decisions. Get team approval before implementing behavior marked pending.

| ID | Rule / recommendation | Rationale, assumption, consequence | Approval |
|---|---|---|---|
| BR-01 | FIFO by `(joinedAt ASC, id ASC)`; Call Next eligibility is status `WAITING`. | Stable timestamp tie-break; no priority. | Approved baseline |
| BR-02 | Recommend positive integer numbers unique per service queue for that queue's lifetime; never reuse. Display formatting remains unspecified. | `(serviceQueueId, number)` unique; avoids global collisions. | **PENDING APPROVAL** |
| BR-03 | Recommend per-queue transactional counter under row lock/serializable equivalent; increment and entry insert commit together, rollback together. | Prevents collisions under concurrent joins. | **PENDING APPROVAL** |
| BR-04 | Recommend no automatic reset; sequence continues for queue lifetime. If daily reset is chosen, define service-day timezone/boundary and include date in uniqueness scope first. | Avoids silent reuse and unspecified local calendar. Under recommendation there is no service-day concept. | **PENDING APPROVAL** |
| BR-05 | At most one active entry per customer per queue; active=`WAITING`,`CALLED`,`SERVING`. `COMPLETED` permits rejoin. | Explicit definition of active set; no cancellation/no-show in scope. | Baseline plus proposed definition |
| BR-06 | Recommend customers may join different queues simultaneously. | Queues are independent; no cross-queue limit supplied. | **PENDING APPROVAL** |
| BR-07 | Entry has one customer and one queue. Customer reads own only; operators read/change entries through assigned queues only. | Backend ownership/assignment checks. | Approved baseline |
| BR-08 | Recommend availability enum `OPEN`,`CLOSED`; only OPEN queues appear in customer join catalog. | Makes “available” testable without hours/schedules. | **PENDING APPROVAL** |
| BR-09 | Only `WAITING→CALLED→SERVING→COMPLETED`; only an assigned OPERATOR triggers transitions; COMPLETED terminal. | Call Next performs first transition. | Approved baseline |
| BR-10 | Recommend Call Next atomically claims one oldest WAITING; empty queue returns `204` and changes nothing. | Normal empty condition. | **PENDING APPROVAL** |
| BR-11 | Transition timestamps are server-generated UTC and written atomically with status; repeats do not alter them. | Consistent history and tests. | **PENDING APPROVAL** |
| BR-12 | Insert/transitions use transactions; uniqueness/active-entry invariants have database constraints or equivalent serialization. | App prechecks alone race. | Approved engineering baseline |

### 4.1 Transition table

| From → To | Actor/operation | Timestamp | Any other pair (including repeated state) |
|---|---|---|---|
| New → WAITING | CUSTOMER joins OPEN queue | `joinedAt` | Reject |
| WAITING → CALLED | Assigned OPERATOR calls next | `calledAt` | Reject `409 INVALID_STATE_TRANSITION` |
| CALLED → SERVING | Assigned OPERATOR starts | `serviceStartedAt` | Reject `409 INVALID_STATE_TRANSITION` |
| SERVING → COMPLETED | Assigned OPERATOR completes | `completedAt` | Reject `409 INVALID_STATE_TRANSITION` |

## 5. Non-functional requirements

Targets without workload evidence are proposals and need approval.

| ID | Requirement and measure | Status |
|---|---|---|
| NFR-01 | Store passwords only as salted adaptive hashes (Argon2id preferred; reviewed bcrypt acceptable); never return/log credentials, hashes or session secrets. | Required security baseline |
| NFR-02 | Enforce authorization server-side; production session cookies HttpOnly, SameSite, Secure; CSRF protection for cookie-authenticated mutations. | Required security baseline |
| NFR-03 | Concurrent tests show no duplicate queue numbers/active entries/double claims. | Required integrity baseline |
| NFR-04 | Proposed p95 for 1,000-entry local dataset: reads ≤500 ms, mutations ≤1,000 ms, 100 requests/operation excluding browser/network latency. | **PENDING APPROVAL** |
| NFR-05 | Committed mutations survive API restart; no success response before DB commit. | Required; integration verification |
| NFR-06 | Proposed supported widths 360 CSS px and ≥1280 px have no page-level horizontal scrolling. | **PENDING APPROVAL** |
| NFR-07 | Clean-checkout local setup reproducible on Node 24/PostgreSQL with selected package manager; seed safely rerunnable. | Required; commands await Issue #2 |
| NFR-08 | Stable requirement IDs and consistent documented status/error vocabulary. | Required |

## 6. Assumptions and constraints

- **Repository facts:** staging README describes a TokTickIT Lab 5 starter assuming Node.js 24, React, Express, PostgreSQL and Prisma, and states application source is omitted. No package manifest, source, schema, API convention or test framework exists on this branch. This is a reference baseline, not an implemented QMS architecture.
- **Technical proposal:** retain that stack unless Issue #2 selects another; document the selection there. Test framework and package manager remain undecided until inspection of the actual application repository.
- **Stakeholder baseline:** two roles, FIFO, four statuses, ordered lifecycle, same-queue active duplicate prohibition, own-entry privacy, queue-assigned operator access, concurrency-safe numbers and backend-authoritative rules.
- **Pending approvals:** BR-02–06, BR-08, BR-10–11, NFR-04, NFR-06, and session/login proposals in `system-design.md`. Recommended choices are specified so reviewers can approve or amend them. Number scope/representation/reset must be approved before Issue #4 number generation; other foundational/auth work can proceed.
- **Constraint:** Issue #1 is documentation only; no Docker/GCP/CI/CD or future-sprint implementation.

## 7. Contract precedence

This file plus `system-design.md`, `features/sprint-1-core-queue.md`, `api-spec.md`, `ui-spec.md`, `feature-inventory.md` and `tests.md` form one contract. Resolve any conflict across all documents before implementation; examples do not override normative tables.

## 8. Acceptance criteria

| ID | Verifiable outcome | FR/BR | Tests |
|---|---|---|---|
| AC-01 | Active Customer/Operator login creates a session with correct role; logout invalidates it. | FR-01/02 | AUTH-001–003 |
| AC-02 | Bad credentials return generic error and create no session. | FR-01 | AUTH-004 |
| AC-03 | Anonymous protected requests and role-disallowed operations are denied by API. | FR-02/03 | AUTH-005, RBAC-001–003 |
| AC-04 | Operators list only assigned queues; unassigned access is denied. | FR-03/08 | RBAC-004–005 |
| AC-05 | Customer cannot call/start/complete or read another customer's detail. | FR-03/07 | RBAC-001–003,006 |
| AC-06 | Customer catalog shows OPEN queues and no private customer data. | FR-04 | QUEUE-001 |
| AC-07 | Join creates one WAITING entry; closed/unknown queue and duplicate active join fail without extra entry. | FR-05/12 | QUEUE-002–004 |
| AC-08 | Join result returns persisted ID, number, queue name and UTC join time; completed customer may rejoin. | FR-05/06 | QUEUE-002,005, NUMBER-001 |
| AC-09 | Numbers do not collide within approved scope under concurrency; failed transactions do not commit allocations. | FR-06 | NUMBER-001–002, CONCURRENCY-001–002 |
| AC-10 | Customer status/detail contains only their entry, no other customer's identifying data. | FR-07 | RBAC-006, QUEUE-006 |
| AC-11 | Operator entry list is FIFO; Call Next ignores non-WAITING entries. | FR-08, BR-01 | QUEUE-007, FLOW-001 |
| AC-12 | Call Next atomically moves exactly the oldest WAITING entry to CALLED once. | FR-09, BR-01/10 | FLOW-001/002, CONCURRENCY-003 |
| AC-13 | Empty Call Next returns empty result with no changes. | FR-09/12 | FLOW-003 |
| AC-14 | Only assigned operator can move CALLED to SERVING; timestamp set once. | FR-10, BR-09/11 | FLOW-004/005 |
| AC-15 | Only SERVING can complete; timestamps and completed history persist; terminal state enforced. | FR-11/13 | FLOW-006/007 |
| AC-16 | Malformed IDs, conflicts, invalid states and unexpected failures follow common status/envelope mapping. | FR-12 | QUEUE-003, FLOW-008, RBAC-007 |
| AC-17 | The six specified screens expose only role-authorized actions, provide loading/empty/error/success feedback, and support the documented responsive layout. | FR-01–11 | FLOW-009/010 |

## 9. Three-sprint product plan

The product baseline is delivered across three sprints. The dates below are the documented milestone checkpoints for this course handout and must be retained unless the team formally records a change with a rationale.

| Sprint | Planned window | Goal | Included feature IDs | Dependencies | Expected completion outcome |
|---|---|---|---|---|---|
| Sprint 1 | 2026-11-08 | Small working domain slice: authentication, authorization, queue discovery, join, status and FIFO operator workflow | F-01, F-02, F-03, F-04, F-05, F-06 | F-01 foundation before F-02–F-06; authentication and queue rules must be approved before dependent workflow work | Fully validated Sprint 1 slice with persistent queue state, role restrictions and lifecycle transitions |
| Sprint 2 | 2026-11-29 | Expansion of queue operations under the engineering contract; operational edge cases and queue variants | FUT-01, FUT-02, FUT-03, FUT-04 | Depends on Sprint 1 completion and any approved pending decisions (e.g., queue numbering/reset policy and cross-queue semantics) | Completed core expansion with cancellation, no-show handling, multi-counter support and priority handling covered by approved contracts |
| Sprint 3 | Checkpoint 2026-11-29; completion 2026-12-13 | Remaining feature set, integration and product hardening | FUT-05, FUT-06, plus remaining product integration items | Depends on Sprint 2 stabilization and completion of remaining approved backlog items | Final integration, system hardening, analytics/booking readiness and product-level verification |

This plan covers the whole product baseline, not only the Sprint 1 slice. No feature is moved between sprints without a documented reason and contract update.

## 10. Issue #1 Definition of Done

All seven required files exist and agree on IDs, states, permissions, API/data shapes and approval status; every FR maps to feature, AC and tests and every AC has a test; proposals are not misrepresented as approved; review confirms clarity and scope. Diff is documentation-only. Team review precedes merge; this task does not authorize direct merge.
