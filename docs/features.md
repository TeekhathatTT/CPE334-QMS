# Feature Inventory

This inventory defines the Sprint 1 feature baseline and the planned follow-on features for later sprints.

## Sprint 1 Feature Set

| Feature ID | Title | Description | Actor | Sprint | Target issue |
|---|---|---|---|---|---|
| F-01 | Foundation and persistence baseline | Establish the project structure, local environment expectations, and persistence layer prerequisites for queue operations. | Developer / system | 1 | #2 |
| F-02 | Authentication and RBAC | Authenticate users, maintain sessions, and enforce role-based access policies. | CUSTOMER, OPERATOR | 1 | #3 |
| F-03 | Queue catalog and number allocation | Expose OPEN queues and allocate queue numbers through a transaction-safe database process. | CUSTOMER, system | 1 | #4 |
| F-04 | Customer queue join and own-state retrieval | Allow customers to join an OPEN queue and view only their own entry and lifecycle state. | CUSTOMER | 1 | #5 |
| F-05 | Operator lifecycle management | Allow assigned operators to call, start, and complete service for queue entries in FIFO order. | OPERATOR | 1 | #6 |
| F-06 | Integration and regression verification | Validate authentication, authorization, queue correctness, concurrency rules, and the end-to-end workflow. | All | 1 | #7 |

## Planned Follow-on Features

| Feature ID | Title | Description | Sprint |
|---|---|---|---|
| F-07 | Customer cancellation and queue withdrawal | Support cancellation and re-entry workflows for customers. | 2 |
| F-08 | No-show handling and recovery | Handle missed appointments or abandoned service entries. | 2 |
| F-09 | Multi-counter support | Expand service handling to multiple service counters or lanes. | 2 |
| F-10 | Priority queue policy | Add priority ordering beyond FIFO. | 2 |
| F-11 | Operational analytics | Provide queue waiting-time and service-time reporting. | 3 |
| F-12 | Advance appointment booking | Add appointment-based queue scheduling. | 3 |
| F-13 | Product hardening and launch readiness | Finalize operational quality, verification, and launch criteria before broader release. | 3 |

These future features are intentionally excluded from the Sprint 1 engineering contract.