# Three-Sprint Product Plan

This document defines the product plan for the QMS sprint sequence. Sprint 1 establishes the required engineering baseline and end-to-end workflow; Sprint 2 expands business edge cases; Sprint 3 completes the product hardening and operational readiness work.

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

- A local, reproducible application baseline
- Secure session-based authentication with role separation
- Customer queue join and own-status tracking
- Operator queue processing in FIFO order
- Verified regression coverage for auth, RBAC, and lifecycle rules

## Sprint 2 — 29 November 2026

### Goal

Expand the core queue management workflow to handle operational edge cases and realistic queue management scenarios without breaking the Sprint 1 contract.

### Planned features

- F-07: Customer cancellation and queue withdrawal
- F-08: No-show handling and recovery
- F-09: Multi-counter support
- F-10: Priority queue policy

### Expected output

- Operational edge-case handling for queue exceptions
- Expanded lifecycle and business rules for service operations
- Broader operator tools for queue management in a live environment

## Sprint 3 — 13 December 2026

### Goal

Complete product hardening, analytics, and advanced readiness for broader operational use.

### Planned features

- F-11: Operational analytics
- F-12: Advance appointment booking
- F-13: Product hardening and launch readiness

### Expected output

- Operational metrics, reporting, and queue performance insight
- More advanced booking and scheduling flows
- Deployment-ready and verified product baseline

## Dependencies and constraints

- Sprint 2 depends on the Sprint 1 base behavior being verified and accepted.
- Sprint 3 depends on the completion of Sprint 2 stabilization and approval of advanced queue-management rules.
- Future scope is explicitly outside Sprint 1 and must not be described as implemented in the current engineering contract.
