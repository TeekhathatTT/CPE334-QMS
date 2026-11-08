# Feature Inventory and Traceability

## Sprint 1 inventory

| ID | Feature | Actor | Sprint | FRs | Dependencies | Issue |
|---|---|---|---|---|---|---|
| F-01 | Persistence, project foundation, reproducible local setup and seed | System/developer | 1 | FR-12, FR-13 | — | #2 |
| F-02 | Authentication, sessions and role-based access | Customer, Operator | 1 | FR-01–03 | F-01 | #3 |
| F-03 | Queue availability and concurrency-safe number allocation | Customer/system | 1 | FR-04–06, FR-12 | F-01, F-02 | #4 |
| F-04 | Customer join and private status/detail | Customer | 1 | FR-04–07, FR-12–13 | F-02, F-03 | #5 |
| F-05 | Operator queue management lifecycle | Operator | 1 | FR-03, FR-08–13 | F-02, F-03 | #6 |
| F-06 | Integration, authorization regression and E2E validation | All | 1 | FR-01–13 | F-01–05 | #7 |

## Requirement traceability

| FR | Feature | Sprint / issue | AC | Test cases |
|---|---|---|---|---|
| FR-01 | F-02 | 1 / #3 | AC-01,02 | AUTH-001–004 |
| FR-02 | F-02 | 1 / #3 | AC-01,03 | AUTH-003,005 |
| FR-03 | F-02,F-04,F-05 | 1 / #3,#5,#6 | AC-03–05 | RBAC-001–007 |
| FR-04 | F-03,F-04 | 1 / #4,#5 | AC-06,07 | QUEUE-001–003 |
| FR-05 | F-04 | 1 / #5 | AC-07,08 | QUEUE-002–005 |
| FR-06 | F-03 | 1 / #4 | AC-08,09 | NUMBER-001,002; CONCURRENCY-001,002 |
| FR-07 | F-04 | 1 / #5 | AC-10 | QUEUE-006; RBAC-006 |
| FR-08 | F-05 | 1 / #6 | AC-04,11 | QUEUE-007; RBAC-004,005 |
| FR-09 | F-05 | 1 / #6 | AC-11–13 | FLOW-001–003; CONCURRENCY-003 |
| FR-10 | F-05 | 1 / #6 | AC-14 | FLOW-004,005 |
| FR-11 | F-05 | 1 / #6 | AC-15 | FLOW-006,007 |
| FR-12 | F-01,F-03,F-04,F-05 | 1 / #2,#4–#6 | AC-07,13,16 | QUEUE-003,004; FLOW-008; RBAC-007 |
| FR-13 | F-01,F-04,F-05 | 1 / #2,#5,#6 | AC-08,15 | QUEUE-002,005; FLOW-005–007 |
| UI behavior across FR-01–11 | F-02,F-04,F-05,F-06 | 1 / #3,#5–#7 | AC-17 | FLOW-009,010 |

## Business-rule traceability

| Rule | AC | Tests |
|---|---|---|
| BR-01 FIFO/eligibility | AC-11,12 | QUEUE-007, FLOW-001, CONCURRENCY-003 |
| BR-02 scope/no reuse | AC-09 | NUMBER-001,002 |
| BR-03 allocator safety | AC-09 | NUMBER-002, CONCURRENCY-001 |
| BR-04 reset policy | AC-09 | NUMBER-001,002 |
| BR-05 duplicate/rejoin | AC-07,08 | QUEUE-003,005, CONCURRENCY-002 |
| BR-06 cross-queue behavior | AC-07 | QUEUE-008 |
| BR-07 ownership/assignment | AC-04,05,10 | RBAC-004–006 |
| BR-08 OPEN eligibility | AC-06,07 | QUEUE-001,004 |
| BR-09 lifecycle | AC-12,14–16 | FLOW-002,004,006–008 |
| BR-10 empty queue | AC-13 | FLOW-003 |
| BR-11 timestamps | AC-14,15 | FLOW-005–007 |
| BR-12 transaction integrity | AC-09,12,16 | CONCURRENCY-001–003 |

## NFR traceability

| NFR | Feature / system responsibility | Sprint / issue | Expected verification |
|---|---|---|---|
| NFR-01 | F-02 Authentication and session design; system-wide secret handling | 1 / #3 | Auth integration tests; code review of password hash and session storage |
| NFR-02 | F-02 Authentication and RBAC; system-wide API security contract | 1 / #3 | Auth regression and RBAC integration tests; cookie/CSRF policy review |
| NFR-03 | F-03 queue numbering; F-05 operator lifecycle; F-06 integration validation | 1 / #4,#6,#7 | Concurrency tests for numbers, duplicate joins and call-next claims |
| NFR-04 | F-03 queue allocation; F-05 operator workflow; F-06 integration/performance checks | 1 / #4,#6,#7 | Local load/performance checks on seeded dataset, to be approved before release |
| NFR-05 | F-01 persistence; F-03 queue allocation; F-05 lifecycle actions | 1 / #2,#4,#6 | DB integration tests assert committed writes survive restart and no pre-commit success |
| NFR-06 | F-04 customer flows; F-05 operator dashboard; F-06 UI validation | 1 / #5,#6,#7 | Responsive E2E checks at 360px and 1280px; no page-level overflow |
| NFR-07 | F-01 repository foundation; F-06 integration automation | 1 / #2,#7 | Local setup reproducibility and seed verification |
| NFR-08 | Cross-cutting quality, requirement and error contract | 1 / #1,#7 | Review of IDs, contracts and status/error vocabulary |

## Later sprint (excluded from Sprint 1 contract)

| Feature | Scope | Planned sprint / issue |
|---|---|---|
| FUT-01 | Customer cancellation | Sprint 2; unassigned |
| FUT-02 | No-show handling | Sprint 2; unassigned |
| FUT-03 | Multiple service counters | Sprint 2; unassigned |
| FUT-04 | Priority policy | Sprint 2; unassigned |
| FUT-05 | Analytics/advanced summaries | Sprint 3; unassigned |
| FUT-06 | Advance appointment booking | Sprint 3; unassigned |

These are future-sprint exclusions only; this inventory defines their planned allocation but not the detailed data, UI or behavior contracts for those later features.
