# Feature Inventory

This inventory defines the Sprint 1 baseline and planned follow-on features. Related requirements identify the requirements each feature establishes or supports; dependencies identify prerequisite features.

## Sprint 1 Feature Set

| Feature ID | Title | Description | Category | Actor | Sprint | Target Issue | Related Requirements | Dependencies |
|---|---|---|---|---|---|---|---|---|
| F-01 | Foundation and persistence baseline | Establish the shared project, local setup, and persistence foundation required by the product features; the foundation is verified in Sprint 1. | System Foundation | Developer / system | 1 | #2 | FR-06, FR-13; BR-03, BR-12; NFR-03, NFR-05, NFR-07 | None |
| F-02 | Authentication and RBAC | Authenticate users, maintain sessions, and enforce role-based access and queue-assignment policies. | Core Product Feature | CUSTOMER, OPERATOR | 1 | #3 | FR-01–FR-03; BR-07; NFR-01, NFR-02, NFR-08 | Depends on F-01 |
| F-03 | Queue catalog and number allocation | Expose OPEN queues and allocate unique queue numbers using a transaction-safe database process. | Core Product Feature | CUSTOMER, system | 1 | #4 | FR-04, FR-06; BR-02–BR-04, BR-08, BR-12; NFR-03, NFR-04 | Depends on F-01 |
| F-04 | Customer queue join and own-state retrieval | Let customers join OPEN queues and retrieve only their own queue entries and lifecycle state. | Core Product Feature | CUSTOMER | 1 | #5 | FR-05, FR-07, FR-12; BR-05–BR-08; NFR-04, NFR-08 | Depends on F-02, F-03 |
| F-05 | Operator lifecycle management | Let assigned operators view entries in FIFO order and call, start, and complete service. | Core Product Feature | OPERATOR | 1 | #6 | FR-03, FR-08–FR-13; BR-01, BR-07, BR-09–BR-12; NFR-02–NFR-05, NFR-08 | Depends on F-02, F-03, F-04 |
| F-06 | Integration and regression verification | Verify integration, authorization, workflow consistency, concurrency, and end-to-end behavior across the Sprint 1 system; this is not an independent customer-facing capability. | Cross-Cutting Responsibility / Verification Activity | System / QA | 1 | #7 | FR-01–FR-13; BR-01–BR-12; NFR-01–NFR-08 | Depends on F-01–F-05 |

## Planned Follow-on Features

Future behavior does not have separate requirement IDs in the current SRS. Where an existing baseline requirement is listed, it is an enabling requirement and does not define the future behavior.

| Feature ID | Title | Description | Actor | Sprint | Related Requirements | Dependencies |
|---|---|---|---|---|---|---|
| F-07 | Customer cancellation and queue withdrawal | Support customer cancellation and queue withdrawal workflows. | CUSTOMER | 2 | Not yet specified; cancellation behavior is excluded from the current SRS. | Depends on F-04 |
| F-08 | No-show handling and recovery | Handle missed service turns and define recovery or re-entry behavior. | OPERATOR | 2 | Not yet specified; no-show behavior is excluded from the current SRS. | Depends on F-05 |
| F-09 | Multi-counter support | Expand service handling to multiple counters or lanes and route queue work accordingly. | OPERATOR, system | 2 | Not yet specified; multi-counter behavior is excluded from the current SRS. | Depends on F-03, F-05 |
| F-10 | Priority queue policy | Add operator-managed priority ordering beyond the Sprint 1 FIFO policy. | OPERATOR, system | 2 | Not yet specified; priority behavior is excluded from the current SRS. | Depends on F-03, F-05 |
| F-11 | Operational analytics | Provide queue waiting-time and service-time reporting from retained lifecycle data. | OPERATOR, management | 3 | FR-13 and BR-11 provide lifecycle history only; analytics requirements are not yet specified. | Depends on F-01, F-05 |
| F-12 | Advance appointment booking | Add customer appointment scheduling and connect appointments to queue availability. | CUSTOMER | 3 | FR-04, FR-05, and BR-08 provide queue catalog and join foundations only; booking requirements are not yet specified. | Depends on F-03, F-04 |
| F-13 | Product hardening and launch readiness | Complete broader operational quality, verification, and launch-readiness work after planned capabilities are delivered. | System / delivery team | 3 | NFR-01–NFR-08 are the Sprint 1 quality baseline; additional launch criteria are not yet specified. | Depends on F-01–F-12 |

These future features are intentionally excluded from the Sprint 1 engineering contract. The Sprint 2 and Sprint 3 plans are in [sprints/plan.md](./sprints/plan.md).
