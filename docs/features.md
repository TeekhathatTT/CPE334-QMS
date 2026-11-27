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

Future behavior does not have separate requirement IDs in the current SRS. Where an existing baseline requirement is listed, it is an enabling requirement and does not define the future behavior. *Rev. 2026-11-27:* F-07 is now specified in SRS v2.0 and has its own requirement IDs (see its row). F-08 is specified in SRS v3.0 (see its row).

| Feature ID | Title | Description | Actor | Sprint | Related Requirements | Dependencies |
|---|---|---|---|---|---|---|
| F-07 | Customer cancellation and queue withdrawal | A customer cancels their own `WAITING` entry; it becomes the terminal status `CANCELLED` with `cancelledAt`, is kept for history, is never called, and frees the customer to rejoin with a new number. Issue #40. Design: [features/sprint-2-f07-customer-cancellation.md](./features/sprint-2-f07-customer-cancellation.md). **Status: Implemented and verified locally (2026-11-27, commit `61e9daf`; see [sprints/sprint-2/completion.md](./sprints/sprint-2/completion.md)); pending review and release.** | CUSTOMER | 2 | FR-14 (new); BR-13, BR-14 (new); BR-05, BR-09 (revised in SRS v2.0); FR-07, FR-08, FR-09, FR-12, FR-13, BR-01, BR-07, BR-10–BR-12 (affected, unchanged); NFR-02, NFR-03, NFR-05, NFR-06, NFR-08; AC-17–AC-24 | Depends on F-04 |
| F-08 | No-show handling and recovery | An assigned operator marks a `CALLED` entry `NO_SHOW` (`noShowAt`, `noShowCount`); the operator may return it to the queue once at its original FIFO position (`recoveredAt`); a second no-show is final. `NO_SHOW` is not active, so the customer may also rejoin. Issue #41. Design: [features/sprint-2-f08-no-show-recovery.md](./features/sprint-2-f08-no-show-recovery.md). **Status: Implemented and verified locally (2026-11-27, commit `37fd6c0`; see [sprints/sprint-2/completion.md](./sprints/sprint-2/completion.md)); pending review and release.** | OPERATOR | 2 | FR-15, FR-16 (new); BR-15, BR-16, BR-17 (new); BR-05, BR-09 (revised in SRS v3.0); FR-03, FR-07, FR-08, FR-09, FR-12, FR-13, BR-01, BR-07, BR-10–BR-13 (affected, unchanged); NFR-02–NFR-06, NFR-08; AC-25–AC-34 | Depends on F-05; interacts with F-04, F-07 |
| F-09 | Multi-counter support | Expand service handling to multiple counters or lanes and route queue work accordingly. | OPERATOR, system | 2 | Not yet specified; multi-counter behavior is excluded from the current SRS. | Depends on F-03, F-05 |
| F-10 | Priority queue policy | Add operator-managed priority ordering beyond the Sprint 1 FIFO policy. | OPERATOR, system | 2 | Not yet specified; priority behavior is excluded from the current SRS. | Depends on F-03, F-05 |
| F-11 | Operational analytics | Provide queue waiting-time and service-time reporting from retained lifecycle data. | OPERATOR, management | 3 | FR-13 and BR-11 provide lifecycle history only; analytics requirements are not yet specified. | Depends on F-01, F-05 |
| F-12 | Advance appointment booking | Add customer appointment scheduling and connect appointments to queue availability. | CUSTOMER | 3 | FR-04, FR-05, and BR-08 provide queue catalog and join foundations only; booking requirements are not yet specified. | Depends on F-03, F-04 |
| F-13 | Product hardening and launch readiness | Complete broader operational quality, verification, and launch-readiness work after planned capabilities are delivered. | System / delivery team | 3 | NFR-01–NFR-08 are the Sprint 1 quality baseline; additional launch criteria are not yet specified. | Depends on F-01–F-12 |

These future features are intentionally excluded from the Sprint 1 engineering contract. The Sprint 2 and Sprint 3 plans are in [sprints/plan.md](./sprints/plan.md).

## Revision history

| Date | Change |
|---|---|
| 2026-11-27 | F-07 row: description, related requirements and status updated for contract v1. Previous related-requirements text: "Not yet specified; cancellation behavior is excluded from the current SRS." Previous description: "Support customer cancellation and queue withdrawal workflows." |
| 2026-11-27 | F-07 status: "Specified (contract v1, 2026-11-27); not implemented." changed to "Implemented and verified locally"; pending review and release. |
| 2026-11-27 | F-08 row: description, related requirements, dependencies and status updated for contract v1 (issue #41). Previous description: "Handle missed service turns and define recovery or re-entry behavior." Previous related requirements: "Not yet specified; no-show behavior is excluded from the current SRS." Previous dependencies: "Depends on F-05". |
| 2026-11-27 | F-08 status: "Specified (contract v1, 2026-11-27); not implemented." changed to "Implemented and verified locally" (`37fd6c0`); pending review and release. |
