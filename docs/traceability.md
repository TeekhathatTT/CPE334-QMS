# Traceability Matrix

This document maps requirements to features, acceptance criteria, and planned tests for Sprint 1.

## Requirements to Features

| Requirement | Feature(s) | Sprint | Acceptance criteria |
|---|---|---|---|
| FR-01 | F-02 | 1 | AC-01, AC-02 |
| FR-02 | F-02 | 1 | AC-01, AC-03 |
| FR-03 | F-02, F-05 | 1 | AC-03, AC-04, AC-05 |
| FR-04 | F-03, F-04 | 1 | AC-06 |
| FR-05 | F-04 | 1 | AC-07, AC-08 |
| FR-06 | F-03 | 1 | AC-08, AC-09 |
| FR-07 | F-04 | 1 | AC-10 |
| FR-08 | F-05 | 1 | AC-04, AC-11 |
| FR-09 | F-05 | 1 | AC-11, AC-12, AC-13 |
| FR-10 | F-05 | 1 | AC-14 |
| FR-11 | F-05 | 1 | AC-15 |
| FR-12 | F-01, F-03, F-04, F-05 | 1 | AC-07, AC-13, AC-16 |
| FR-13 | F-01, F-04, F-05 | 1 | AC-08, AC-15 |

## Business Rules to Tests

| Business rule | Related acceptance criteria | Planned verification |
|---|---|---|
| BR-01 FIFO ordering | AC-11, AC-12 | FLOW-001, FLOW-002 |
| BR-02 queue numbering scope | AC-08, AC-09 | NUMBER-001 |
| BR-03 database-level number generation | AC-09 | NUMBER-002, CONCURRENCY-001 |
| BR-04 no queue reset in Sprint 1 | AC-08, AC-09 | NUMBER-001 |
| BR-05 one active entry per customer per queue | AC-07, AC-08 | QUEUE-003, QUEUE-005, CONCURRENCY-002 |
| BR-06 multiple queues per customer allowed | AC-07 | QUEUE-008 |
| BR-07 ownership and assignment enforcement | AC-04, AC-05, AC-10 | RBAC-004, RBAC-005, RBAC-006 |
| BR-08 OPEN/CLOSED queue availability | AC-06, AC-07 | QUEUE-001, QUEUE-004 |
| BR-09 lifecycle transition rules | AC-12, AC-14, AC-15, AC-16 | FLOW-002, FLOW-004, FLOW-006, FLOW-008 |
| BR-10 empty Call Next returns 204 | AC-13 | FLOW-003 |
| BR-11 server timestamps | AC-14, AC-15 | FLOW-005, FLOW-006 |
| BR-12 transaction integrity | AC-09, AC-12, AC-16 | CONCURRENCY-001, CONCURRENCY-003 |

## Acceptance Criteria to Planned Tests

| AC | Test IDs |
|---|---|
| AC-01 | AUTH-001, AUTH-002, AUTH-003 |
| AC-02 | AUTH-004 |
| AC-03 | AUTH-005, RBAC-001, RBAC-002, RBAC-003 |
| AC-04 | RBAC-004, QUEUE-007 |
| AC-05 | RBAC-001, RBAC-002, RBAC-003, RBAC-006 |
| AC-06 | QUEUE-001 |
| AC-07 | QUEUE-002, QUEUE-003, QUEUE-004, QUEUE-008 |
| AC-08 | QUEUE-002, QUEUE-005, NUMBER-001 |
| AC-09 | NUMBER-001, NUMBER-002, CONCURRENCY-001 |
| AC-10 | QUEUE-006, RBAC-006 |
| AC-11 | QUEUE-007, FLOW-001 |
| AC-12 | FLOW-001, FLOW-002, CONCURRENCY-003 |
| AC-13 | FLOW-003 |
| AC-14 | FLOW-004, FLOW-005 |
| AC-15 | FLOW-006, FLOW-007 |
| AC-16 | FLOW-008, RBAC-007 |
| AC-17 | FLOW-009, FLOW-010 |

## Feature Inventory Summary

| Feature ID | Sprint | Description |
|---|---|---|
| F-01 | 1 | Persistence layer and project foundation |
| F-02 | 1 | Authentication and role-based access |
| F-03 | 1 | Queue catalog and concurrency-safe queue numbers |
| F-04 | 1 | Customer join and personal status tracking |
| F-05 | 1 | Operator queue management lifecycle |
| F-06 | 1 | Regression and verification coverage |
| F-07 | 2 | Customer cancellation and no-show handling |
| F-08 | 2 | Multi-counter queue views and routing |
| F-09 | 2 | Priority queue policy |
| F-10 | 3 | Analytics and operational reporting |
| F-11 | 3 | Advance booking and additional queue types |
| F-12 | 3 | Advance booking and additional queue types |
| F-13 | 3 | Product hardening and launch readiness |

The Sprint 2 and Sprint 3 features are planned future work and are intentionally out of scope for Sprint 1 implementation.
