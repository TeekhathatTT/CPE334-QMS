# Three-Sprint Product Plan

This document defines the product plan for the QMS sprint sequence. Sprint 1 establishes the required engineering baseline and end-to-end workflow; Sprint 2 expands business edge cases; Sprint 3 completes the product hardening and operational readiness work.

## Three-Sprint Summary

| Sprint | Target Date | Goal | Included Features | Dependencies | Expected Output |
|---|---|---|---|---|---|
| 1 | 8 November 2026 | Establish the minimum usable queue-management vertical slice. | F-01–F-06 | F-01 is the shared foundation for F-02–F-05; F-06 verifies the integrated Sprint 1 features. | Planned: authenticated customer/operator workflows, persistent queue data, transactional queue-number allocation, customer status lookup, and operator lifecycle processing. |
| 2 | 29 November 2026 | Extend the core workflow with cancellation, no-show recovery, multiple counters, and priority handling. | F-07–F-10 | F-07 depends on F-04; F-08 on F-05; F-09 and F-10 on F-03 and F-05. Sprint 1 behavior is a prerequisite. | Planned: defined and verified operational exception handling and expanded queue routing/ordering without breaking the Sprint 1 contract. |
| 3 | Final completion: 13 December 2026 | Complete analytics, appointment booking, and product hardening with final integration. | F-11–F-13 | F-11 depends on F-01 and F-05; F-12 on F-03 and F-04; F-13 on F-01–F-12. Sprint 2 stabilization is a prerequisite. The 29 November Deliverable 2 date is a progress checkpoint, not final completion. | Planned: reporting and booking capabilities integrated with a hardened, verified product baseline by 13 December. |

## Sprint 1 — 8 November 2026

### Goal

Deliver a working vertical slice for queue-based service management with persistent data, authenticated access, queue lifecycle transitions, and validation of core business rules.

### In-scope features

- F-01: Foundation and persistence baseline
- F-02: Authentication and RBAC
- F-03: Queue catalog and number allocation
- F-04: Customer queue join and own-state retrieval
- F-05: Operator lifecycle management
- F-06: Integration and regression verification

### Why this scope is selected

Sprint 1 is intentionally limited to the smallest end-to-end workflow that proves the product can operate reliably. The team must complete authentication, server-side authorization, database persistence, queue creation, queue-number generation, safe transactional allocation, and the core customer/operator lifecycle before later growth features are attempted. This establishes the technical and business foundation needed for Sprint 2 and Sprint 3.

### Expected output

- Planned: a local, reproducible application baseline
- Planned: secure session-based authentication with role separation
- Planned: customer queue join and own-status tracking
- Planned: operator queue processing in FIFO order
- Planned: regression verification for authentication, RBAC, and lifecycle rules

## Sprint 2 — 29 November 2026

### Goal

Expand the core queue management workflow to handle operational edge cases and realistic queue management scenarios without breaking the Sprint 1 contract. These are planned capabilities, not claims about completed implementation.

### Planned features

- F-07: Customer cancellation and queue withdrawal
- F-08: No-show handling and recovery
- F-09: Multi-counter support
- F-10: Priority queue policy

### Feature dependencies

| Feature ID | Feature Name | Dependencies | Dependency Rationale |
|---|---|---|---|
| F-07 | Customer cancellation and queue withdrawal | F-04 | Cancellation acts on an existing customer queue entry created and retrieved by the customer workflow. |
| F-08 | No-show handling and recovery | F-05 | No-show handling extends the operator-managed call and service lifecycle. |
| F-09 | Multi-counter support | F-03, F-05 | Counters must be associated with existing queues and integrated with operator queue processing. |
| F-10 | Priority queue policy | F-03, F-05 | Priority changes selection/order of waiting entries and must integrate with queue allocation and operator processing. |

### Expected output

- Planned: specified and verified operational edge-case handling for queue exceptions
- Planned: expanded lifecycle and business rules for service operations
- Planned: broader operator tools for queue management

Sprint 2's target date is 29 November 2026. This is also the academic Deliverable 2 submission date and Sprint 3 progress checkpoint; it does not mark Sprint 3 final completion.

## Sprint 3 — Checkpoint: 29 November 2026; Final Completion: 13 December 2026

**Checkpoint: 29 November 2026; Final Completion: 13 December 2026**

### Goal

Complete product hardening, analytics, and advanced readiness for broader operational use. The academic progress checkpoint is 29 November 2026, associated with Deliverable 2. Sprint 3 work continues after that checkpoint; the final completion target is 13 December 2026.

### Planned features

- F-11: Operational analytics
- F-12: Advance appointment booking
- F-13: Product hardening and launch readiness

### Feature dependencies

| Feature ID | Feature Name | Dependencies | Dependency Rationale |
|---|---|---|---|
| F-11 | Operational analytics | F-01, F-05 | Reporting requires the shared persistence foundation and retained operator lifecycle data. |
| F-12 | Advance appointment booking | F-03, F-04 | Booking builds on queue availability/catalog behavior and customer queue workflows. |
| F-13 | Product hardening and launch readiness | F-01–F-12 | Final hardening and launch-readiness verification apply to the foundation and all planned product capabilities. |

### Expected output

- At the 29 November checkpoint: planned progress evidence for Deliverable 2; Sprint 3 work is still in progress.
- By 13 December final completion: planned operational metrics, reporting, and queue performance insight
- By 13 December final completion: planned advanced booking and scheduling flows
- By 13 December final completion: planned integrated, hardened, and verified product baseline

## Dependencies and constraints

- Sprint 2 depends on the Sprint 1 base behavior being verified and accepted; feature-level prerequisites are listed above and match [features.md](../features.md).
- Sprint 3 depends on Sprint 1 foundations, Sprint 2 stabilization, and approval of advanced queue-management rules; feature-level prerequisites are listed above and match [features.md](../features.md).
- Future scope is explicitly outside Sprint 1 and must not be described as implemented in the current engineering contract.
