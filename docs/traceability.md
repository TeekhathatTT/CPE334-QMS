# Traceability Matrix

This document maps the Sprint 1 baseline requirements to their responsible features, acceptance criteria, and planned verification tests. Test IDs are plans, not evidence that tests have passed. Feature titles and sprint assignments are aligned with [features.md](./features.md).

## Functional Requirements Traceability

| Requirement | Responsible Feature(s) | Sprint | Acceptance Criteria | Planned Test ID(s) |
|---|---|---|---|---|
| FR-01 | F-02 | 1 | AC-01, AC-02 | AUTH-001, AUTH-002, AUTH-004, SEC-001 |
| FR-02 | F-02 | 1 | AC-01, AC-03 | AUTH-003, AUTH-005 |
| FR-03 | F-02, F-05 | 1 | AC-03, AC-04, AC-05 | RBAC-001–RBAC-004 |
| FR-04 | F-03 | 1 | AC-06 | QUEUE-001 |
| FR-05 | F-04 | 1 | AC-07, AC-08 | QUEUE-002 |
| FR-06 | F-03 | 1 | AC-08, AC-09 | NUMBER-001, NUMBER-002, CONCURRENCY-001 |
| FR-07 | F-04 | 1 | AC-10 | QUEUE-006, RBAC-005 |
| FR-08 | F-05 | 1 | AC-04, AC-11 | RBAC-004, QUEUE-007 |
| FR-09 | F-05 | 1 | AC-11, AC-12, AC-13 | FLOW-001–FLOW-003, CONCURRENCY-003 |
| FR-10 | F-05 | 1 | AC-14 | FLOW-004, FLOW-005 |
| FR-11 | F-05 | 1 | AC-15 | FLOW-006, FLOW-007 |
| FR-12 | F-03, F-04, F-05 | 1 | AC-07, AC-13, AC-16 | API-001, QUEUE-003, QUEUE-004, FLOW-005, FLOW-007, CONCURRENCY-004 |
| FR-13 | F-01, F-04, F-05 | 1 | AC-08, AC-15 | QUEUE-002, FLOW-002, FLOW-004, FLOW-006, REL-001 |

F-06 is the cross-cutting verification responsibility for this entire baseline; feature ownership above identifies the features that establish each requirement.

## Business Rules to Tests

| BR ID | Business Rule Summary | Feature(s) | Acceptance Criteria | Test ID(s) |
|---|---|---|---|---|
| BR-01 | FIFO processing by `(joinedAt ASC, id ASC)` for eligible WAITING entries | F-05 | AC-11, AC-12 | QUEUE-007, FLOW-001, FLOW-002 |
| BR-02 | Queue numbers are positive integers scoped to one queue | F-03 | AC-08, AC-09 | NUMBER-001 |
| BR-03 | Queue-number generation uses a database transaction and row lock | F-01, F-03 | AC-09 | NUMBER-002, CONCURRENCY-001 |
| BR-04 | Queue numbers do not reset during Sprint 1 | F-03 | AC-08, AC-09 | NUMBER-001 |
| BR-05 | At most one active entry per customer per queue; completed entries may be rejoined | F-04 | AC-07, AC-08 | QUEUE-003, QUEUE-005, CONCURRENCY-002 |
| BR-06 | A customer may join multiple queues simultaneously | F-04 | AC-07 | QUEUE-008 |
| BR-07 | Customer reads are self-scoped and operators are restricted to assigned queues | F-02, F-04, F-05 | AC-04, AC-05, AC-10 | RBAC-004, RBAC-005, QUEUE-006 |
| BR-08 | Only OPEN queues appear in the customer catalog and may be joined | F-03, F-04 | AC-06, AC-07 | QUEUE-001, QUEUE-004 |
| BR-09 | Lifecycle is `WAITING -> CALLED -> SERVING -> COMPLETED` with no alternate transitions | F-05 | AC-12, AC-14, AC-15, AC-16 | FLOW-002, FLOW-004, FLOW-005, FLOW-006, FLOW-007 |
| BR-10 | Empty Call Next returns 204 without changing state | F-05 | AC-13 | FLOW-003 |
| BR-11 | Lifecycle timestamps are server-generated UTC values and committed with status changes | F-05 | AC-14, AC-15 | FLOW-002, FLOW-004, FLOW-006 |
| BR-12 | Transactions and database constraints enforce uniqueness and state invariants | F-01, F-03, F-05 | AC-09, AC-12, AC-16 | NUMBER-002, CONCURRENCY-001, CONCURRENCY-003, CONCURRENCY-004 |

## Non-Functional Requirements Traceability

| NFR ID | Requirement Summary | Responsible Feature(s) | Verification Sprint | Test ID(s) | Verification Method |
|---|---|---|---|---|---|
| NFR-01 | Store passwords only as salted adaptive hashes; do not return or log credentials, hashes, or session secrets. | F-02; F-06 verifies | 1 | SEC-001, AUTH-001, AUTH-002, AUTH-004 | Inspect configured hash method, API responses, and logs during login and invalid-credential tests. |
| NFR-02 | Enforce authorization server-side and require CSRF protection for cookie-authenticated mutations. | F-02, F-05; F-06 verifies | 1 | SEC-002, AUTH-003, AUTH-005, RBAC-001–RBAC-004 | Exercise protected endpoints with missing/expired sessions, unauthorized roles/assignments, and missing/invalid CSRF tokens. |
| NFR-03 | Prevent duplicate queue numbers, active entries, and double-claims under concurrent load. | F-01, F-03, F-05; F-06 verifies | 1 | CONCURRENCY-001–CONCURRENCY-004 | Run database-backed parallel joins, duplicate joins, call-next operations, and stale mutations; assert uniqueness and valid state. |
| NFR-04 | Meet local performance targets on a seeded 1,000-entry dataset. | F-03–F-05; F-06 verifies | 1 | PERF-001 | Execute 100 requests per operation against the local database and measure p95: reads <= 500 ms, mutations <= 1,000 ms. |
| NFR-05 | Return mutation success only after the database commit is durable. | F-01, F-05; F-06 verifies | 1 | REL-001 | Verify mutation responses follow commit and that committed records remain after application/database restart validation. |
| NFR-06 | Keep customer and operator flows usable without horizontal overflow at 360 px and 1280 px. | F-04, F-05; F-06 verifies | 1 | UI-001 | Run browser E2E checks for the core flows at both viewport widths and assert no page-level horizontal overflow. |
| NFR-07 | Reproduce local setup and seed required test accounts and queues from a clean checkout. | F-01; F-06 verifies | 1 | SETUP-001 | Follow documented setup from a clean checkout and confirm required seeded records are created without manual intervention. |
| NFR-08 | Support customer and operator workflows without exposing private or unassigned queue information. | F-02, F-04, F-05; F-06 verifies | 1 | QUEUE-006, RBAC-004, RBAC-005, FLOW-009, FLOW-010 | Verify customer ownership/privacy, operator assignment restrictions, and both customer/operator E2E workflows. |

## Acceptance Criteria to Planned Tests

| Acceptance Criteria | Test ID(s) |
|---|---|
| AC-01 | AUTH-001, AUTH-002, AUTH-003 |
| AC-02 | AUTH-004 |
| AC-03 | AUTH-005, RBAC-001, RBAC-002, RBAC-003 |
| AC-04 | RBAC-004, QUEUE-007 |
| AC-05 | RBAC-001, RBAC-002, RBAC-003, RBAC-004 |
| AC-06 | QUEUE-001 |
| AC-07 | QUEUE-002, QUEUE-003, QUEUE-004, QUEUE-008 |
| AC-08 | QUEUE-002, QUEUE-005, NUMBER-001 |
| AC-09 | NUMBER-001, NUMBER-002, CONCURRENCY-001 |
| AC-10 | QUEUE-006, RBAC-005 |
| AC-11 | QUEUE-007, FLOW-001 |
| AC-12 | FLOW-001, FLOW-002, CONCURRENCY-003 |
| AC-13 | FLOW-003 |
| AC-14 | FLOW-004, FLOW-005 |
| AC-15 | FLOW-006, FLOW-007 |
| AC-16 | API-001, QUEUE-003, QUEUE-004, FLOW-005, FLOW-007, CONCURRENCY-004 |

## Feature Inventory Summary

| Feature ID | Title | Sprint |
|---|---|---|
| F-01 | Foundation and persistence baseline | 1 |
| F-02 | Authentication and RBAC | 1 |
| F-03 | Queue catalog and number allocation | 1 |
| F-04 | Customer queue join and own-state retrieval | 1 |
| F-05 | Operator lifecycle management | 1 |
| F-06 | Integration and regression verification | 1 |
| F-07 | Customer cancellation and queue withdrawal | 2 |
| F-08 | No-show handling and recovery | 2 |
| F-09 | Multi-counter support | 2 |
| F-10 | Priority queue policy | 2 |
| F-11 | Operational analytics | 3 |
| F-12 | Advance appointment booking | 3 |
| F-13 | Product hardening and launch readiness | 3 |

## Coverage Gaps and Approved Changes

### Sprint 1 Baseline Coverage

Every baseline functional requirement (FR-01–FR-13), business rule (BR-01–BR-12), and non-functional requirement (NFR-01–NFR-08) has a responsible feature and at least one planned verification test in the traceability tables above. The NFR-specific tests added to the test specification are planned activities, not evidence of execution or passing results. The referenced acceptance criteria IDs AC-01–AC-16 are present in the SRS requirement definitions.

### Future Sprint Allocation

- Sprint 2: F-07 Customer cancellation and queue withdrawal; F-08 No-show handling and recovery; F-09 Multi-counter support; F-10 Priority queue policy.
- Sprint 3: F-11 Operational analytics; F-12 Advance appointment booking; F-13 Product hardening and launch readiness.

These features are intentionally deferred from Sprint 1. Their future-specific requirements have not yet been defined in the current SRS; this is planned future scope, not an uncovered Sprint 1 baseline.

### Approved Changes

No approved requirement changes were recorded during this update.
