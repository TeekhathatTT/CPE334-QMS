# Traceability Matrix

> **Version:** 1.1 | **Last Updated:** 2026-11-27 | **Sprint 1 Baseline:** commit `e304cd9` (`main`), deployed revision `qms-00005-5kz` | **Change Ref:** Issue #51 (Lab 7 Part A — BR-06)

This document maps the Sprint 1 baseline requirements (and approved Lab 7 changes) to their responsible features, acceptance criteria, and verification tests. Feature titles and sprint assignments are aligned with [features.md](./features.md).

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
| FR-12 | F-03, F-04, F-05 | 1 | AC-07, AC-13, AC-16; CR51-AC1–CR51-AC4 | API-001, QUEUE-003, QUEUE-004, QUEUE-009, QUEUE-010, QUEUE-011, FLOW-005, FLOW-007, CONCURRENCY-004, CONCURRENCY-005, UI-002 |
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
| BR-06 | A customer may hold at most 2 active entries (`WAITING`, `CALLED`, `SERVING`) across all queues simultaneously; 3rd join rejected with `409 MAX_ACTIVE_ENTRIES_REACHED` (Issue #51) | F-04 | AC-07; CR51-AC1, CR51-AC2, CR51-AC3, CR51-AC4 | QUEUE-008, QUEUE-009, QUEUE-010, QUEUE-011, CONCURRENCY-005, UI-002 |
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
| NFR-02 | Enforce authorization server-side and require CSRF protection for cookie-authenticated mutations. | F-02, F-05; F-06 verifies | 1 | SEC-002, AUTH-003, AUTH-005, RBAC-001–RBAC-004 | Exercise protected endpoints with missing/expired sessions, unauthorized roles/assignments, and missing/invalid CSRF tokens. Automated (#7): `server/tests/integration-sprint1.test.ts` §1–§2, `client/src/test/integration-guards.test.tsx`, `e2e/tests/authorization.spec.ts`. |
| NFR-03 | Prevent duplicate queue numbers, active entries, and double-claims under concurrent load. | F-01, F-03, F-05; F-06 verifies | 1 | CONCURRENCY-001–CONCURRENCY-004 | Run database-backed parallel joins, duplicate joins, call-next operations, and stale mutations; assert uniqueness and valid state. Automated (#7): `server/tests/integration-sprint1.test.ts` §4 (mixed races + SQL invariants). |
| NFR-04 | Meet local performance targets on a seeded 1,000-entry dataset. | F-03–F-05; F-06 verifies | 1 | PERF-001 | Execute 100 requests per operation against the local database and measure p95: reads <= 500 ms, mutations <= 1,000 ms. Automated (#7): `server/tests/nfr/perf-001.ts` (`npm run test:perf --workspace=server`). *Rev. 2026-11-27:* Sprint 2 F-07 cancel mutation measured by PERF-S2-001 (`server/tests/nfr/perf-s2-001-cancel.ts`, see Sprint 2 section). |
| NFR-05 | Return mutation success only after the database commit is durable. | F-01, F-05; F-06 verifies | 1 | REL-001 | Verify mutation responses follow commit and that committed records remain after application/database restart validation. Automated (#7): `server/tests/nfr/rel-001.ts` (`npm run test:rel --workspace=server`). |
| NFR-06 | Keep customer and operator flows usable without horizontal overflow at 360 px and 1280 px. | F-04, F-05; F-06 verifies | 1 | UI-001 | Run browser E2E checks for the core flows at both viewport widths and assert no page-level horizontal overflow. Automated (#7): `e2e/tests/responsive.spec.ts`. |
| NFR-07 | Reproduce local setup and seed required test accounts and queues from a clean checkout. | F-01; F-06 verifies | 1 | SETUP-001 | Follow documented setup from a clean checkout and confirm required seeded records are created without manual intervention. |
| NFR-08 | Support customer and operator workflows without exposing private or unassigned queue information. | F-02, F-04, F-05; F-06 verifies | 1 | QUEUE-006, RBAC-004, RBAC-005, FLOW-009, FLOW-010 | Verify customer ownership/privacy, operator assignment restrictions, and both customer/operator E2E workflows. Automated (#7): `e2e/tests/customer-flow.spec.ts`, `e2e/tests/operator-flow.spec.ts`, `e2e/tests/authorization.spec.ts`, `server/tests/integration-sprint1.test.ts`. |

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
| F-07 | Customer cancellation and queue withdrawal | 2 (specified, contract v1) |
| F-08 | No-show handling and recovery | 2 (specified, contract v1) |
| F-09 | Multi-counter support | 2 (specified, contract v1.1) |
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

*Rev. 2026-11-27:* F-07 now has requirements (FR-14, BR-13, BR-14, AC-17–AC-24 in SRS v2.0); see the Sprint 2 section below. F-08–F-13 are still unspecified. *Rev. 2026-11-27 (F-08):* F-08 now has requirements (FR-15, FR-16, BR-15–BR-17, AC-25–AC-34 in SRS v3.0); see the F-08 section below. F-09–F-13 are still unspecified. *Rev. 2026-11-27 (F-09):* F-09 now has requirements (FR-17–FR-19, BR-18–BR-20, AC-35–AC-44 in SRS v4.0); see the F-09 section below. F-10–F-13 are still unspecified.

### Approved Changes

| Date | Issue / CR | Baseline Ref | Summary | Updated Contracts & Tests |
|---|---|---|---|---|
| 2026-11-27 | Issue #51 (Lab 7 Part A — BR-06) | Commit `e304cd9` (`main`), Cloud Run revision `qms-00005-5kz` | Updated `BR-06` from unlimited simultaneous queues to at most 2 active entries (`WAITING`, `CALLED`, `SERVING`) per customer across all queues (`409 MAX_ACTIVE_ENTRIES_REACHED`); preserved `BR-05` (`409 DUPLICATE_ACTIVE_ENTRY`). | [srs.md](./srs.md) (v1.1), [features/sprint-1-core-queue.md](./features/sprint-1-core-queue.md) (v1.1), [system-sds.md](./system-sds.md) (v1.1), [api-spec.md](./sprints/sprint-1/api-spec.md) (v1.1), [ui-spec.md](./sprints/sprint-1/ui-spec.md) (v1.1), [tests.md](./sprints/sprint-1/tests.md) (v1.1: `QUEUE-009`–`QUEUE-011`, `CONCURRENCY-005`, `UI-002`), [labs/lab-07/impact-analysis.md](./labs/lab-07/impact-analysis.md) |

*Rev. 2026-11-27:* the F-07 change below is proposed in contract v1 and is **pending review** by @Khwanklao. It is not yet an approved change.

| Change | Date | Affected IDs | Status |
|---|---|---|---|
| F-07 customer cancellation (SRS v2.0) | 2026-11-27 | adds FR-14, BR-13, BR-14, AC-17–AC-24; revises BR-05, BR-09 | proposed, review pending |
| F-08 no-show handling and recovery (SRS v3.0) | 2026-11-27 | adds FR-15, FR-16, BR-15–BR-17, AC-25–AC-34, error code `RECOVERY_LIMIT_REACHED`; revises BR-05, BR-09 | proposed, review pending |
| F-09 multi-counter support (SRS v4.0) | 2026-11-27 | adds FR-17–FR-19, BR-18–BR-20, AC-35–AC-44, error codes `COUNTER_CLOSED` and `NO_WAITING_ENTRIES`; updates BR-10 and BR-16 notes | superseded by v4.1 (review fixes) |
| F-09 multi-counter support (SRS v4.1, contract v1.1) | 2026-11-27 | refines BR-19 (legacy Call Next trade-off), BR-20 & AC-41(c) (composite FK `MATCH SIMPLE`), AC-40(a) (parallel `SKIP LOCKED` wording), AC-42 & AC-43 (disabled non-owned counters, 0-usable-counter fallback, `CALLED`/`SERVING`-only badges) | proposed, re-review pending (@TeekhathatTT) |

## Sprint 2 — F-07 Customer Cancellation Traceability

*Rev. 2026-11-27 (results):* every test below was executed. Result = outcome of the green run at commit `61e9daf` (see [sprints/sprint-2/tests.md §6](./sprints/sprint-2/tests.md#6-execution-results) and the raw output in `docs/sprints/sprint-2/evidence/f07-green-run.txt`). Release status: pending release (not yet on `main` or deployed). Test specification: [sprints/sprint-2/tests.md](./sprints/sprint-2/tests.md).

### Requirements to tests

| Requirement | Feature | Sprint | AC | Test ID(s) | Test file | Result (commit) | Contract version |
|---|---|---|---|---|---|---|---|
| FR-14 | F-07 | 2 | AC-17–AC-24 | CANCEL-001–CANCEL-020 | `server/tests/f07-cancel-rule.test.ts`, `server/tests/f07-customer-cancellation.test.ts`, `client/src/test/f07-leaveQueue.test.tsx`, `e2e/tests/f07-cancellation.spec.ts` | passed (61e9daf) | v1 |
| BR-13 | F-07 | 2 | AC-18, AC-19, AC-20 | CANCEL-001, CANCEL-003–CANCEL-009 | `server/tests/f07-cancel-rule.test.ts`, `server/tests/f07-customer-cancellation.test.ts` | passed (61e9daf) | v1 |
| BR-14 | F-07 | 2 | AC-17, AC-22, AC-23 | CANCEL-002, CANCEL-012–CANCEL-015, CANCEL-020 | `server/tests/f07-customer-cancellation.test.ts` | passed (61e9daf) | v1 |
| BR-05 (rev. 2.0) | F-04, F-07 | 2 | AC-21 | CANCEL-010, CANCEL-011, CANCEL-017 | `server/tests/f07-customer-cancellation.test.ts`, `e2e/tests/f07-cancellation.spec.ts` | passed (61e9daf) | v1 |
| BR-09 (rev. 2.0) | F-05, F-07 | 2 | AC-18 | CANCEL-001, CANCEL-003 | `server/tests/f07-cancel-rule.test.ts`, `server/tests/f07-customer-cancellation.test.ts` | passed (61e9daf) | v1 |
| BR-01, BR-10 (F-05 cross-feature) | F-05, F-07 | 2 | AC-22 | CANCEL-012, CANCEL-013 | `server/tests/f07-customer-cancellation.test.ts` | passed (61e9daf) | v1 |
| BR-07, NFR-02, NFR-08 | F-02, F-07 | 2 | AC-19 | CANCEL-004–CANCEL-008 | `server/tests/f07-customer-cancellation.test.ts` | passed (61e9daf) | v1 |
| BR-12, NFR-03, NFR-05 | F-07 | 2 | AC-23 | CANCEL-014, CANCEL-020 | `server/tests/f07-customer-cancellation.test.ts` | passed (61e9daf) | v1 |
| FR-07, FR-13 | F-04, F-07 | 2 | AC-17 | CANCEL-002, CANCEL-015 | `server/tests/f07-customer-cancellation.test.ts` | passed (61e9daf) | v1 |
| NFR-06 | F-07 | 2 | AC-24 | CANCEL-016, CANCEL-019 | `client/src/test/f07-leaveQueue.test.tsx`, `e2e/tests/f07-cancellation.spec.ts` | passed (61e9daf) | v1 |
| NFR-04 | F-07 | 2 | operations of AC-17, AC-21, AC-22 | PERF-S2-001 | `server/tests/nfr/perf-s2-001-cancel.ts` | passed (run 2026-11-27 on the `61e9daf` code; cancel p95 16.4 ms ≤ 1,000 ms; `docs/sprints/sprint-2/evidence/perf-s2-001.txt`) | v1 (*rev. 2026-11-27:* row added after PR #56 review; before it, NFR-04 was listed as applying but not measured) |
| FR-01–FR-13 (regression) | F-06 | 2 | AC-01–AC-16 | REG-S2-001 | existing Sprint 1 suites | passed (61e9daf) | v1 |

### Acceptance criteria to tests

| Acceptance Criteria | Test ID(s) | Result |
|---|---|---|
| AC-17 | CANCEL-002, CANCEL-015, CANCEL-017 | passed (61e9daf) |
| AC-18 | CANCEL-001, CANCEL-003, CANCEL-018 | passed (61e9daf) |
| AC-19 | CANCEL-004, CANCEL-005, CANCEL-006, CANCEL-007, CANCEL-008 | passed (61e9daf) |
| AC-20 | CANCEL-009 | passed (61e9daf) |
| AC-21 | CANCEL-010, CANCEL-011, CANCEL-017 | passed (61e9daf) |
| AC-22 | CANCEL-012, CANCEL-013 | passed (61e9daf) |
| AC-23 | CANCEL-014, CANCEL-020 | passed (61e9daf) |
| AC-24 | CANCEL-016, CANCEL-017, CANCEL-018, CANCEL-019 | passed (61e9daf) |


## Sprint 2 — F-08 No-show Handling and Recovery Traceability

Contract v1 (2026-11-27, issue #41). Every result below is `planned` until the test has been executed. *Rev. 2026-11-27 (results):* every test below was executed; Result = outcome of the green run at commit `37fd6c0` (see [sprints/sprint-2/tests.md §7.5](./sprints/sprint-2/tests.md#75-execution-results-f-08) and `docs/sprints/sprint-2/evidence/f08-green-run.txt`). Release status: pending release. Test specification: [sprints/sprint-2/tests.md §7](./sprints/sprint-2/tests.md#7-f-08-no-show-handling-and-recovery).

### Requirements to tests

| Requirement | Feature | Sprint | AC | Test ID(s) | Test file | Result (commit) | Contract version |
|---|---|---|---|---|---|---|---|
| FR-15 | F-08 | 2 | AC-25, AC-26, AC-27, AC-31, AC-32, AC-33 | NOSHOW-001–NOSHOW-004, NOSHOW-011, NOSHOW-012, NOSHOW-015, NOSHOW-017, NOSHOW-019, NOSHOW-020 | `server/tests/f08-no-show-rule.test.ts`, `server/tests/f08-no-show-recovery.test.ts`, `client/src/test/f08-noShow.test.tsx`, `e2e/tests/f08-no-show.spec.ts` | passed (37fd6c0) | v1 |
| FR-16 | F-08 | 2 | AC-27–AC-30, AC-32, AC-33 | NOSHOW-001, NOSHOW-005–NOSHOW-010, NOSHOW-013, NOSHOW-014, NOSHOW-015, NOSHOW-017, NOSHOW-019 | same four files | passed (37fd6c0) | v1 |
| BR-15 | F-08 | 2 | AC-25, AC-26, AC-27 | NOSHOW-001–NOSHOW-004, NOSHOW-020 | `server/tests/f08-no-show-rule.test.ts`, `server/tests/f08-no-show-recovery.test.ts` | passed (37fd6c0) | v1 |
| BR-16 | F-08 | 2 | AC-27–AC-30 | NOSHOW-001, NOSHOW-005–NOSHOW-009 | same | passed (37fd6c0) | v1 |
| BR-17 | F-08 | 2 | AC-25, AC-28, AC-29, AC-31 | NOSHOW-002, NOSHOW-006, NOSHOW-007, NOSHOW-008, NOSHOW-011 | `server/tests/f08-no-show-recovery.test.ts` | passed (37fd6c0) | v1 |
| BR-05 (rev. 3.0) | F-04, F-08 | 2 | AC-30, AC-32 | NOSHOW-009, NOSHOW-014 | `server/tests/f08-no-show-recovery.test.ts` | passed (37fd6c0) | v1 |
| BR-16 (rev. 4.5), BR-06 | F-08, Lab 7 | 2 | AC-45 | NOSHOW-021, NOSHOW-022, NOSHOW-023 | `server/tests/f08-no-show-recovery.test.ts`, `client/src/test/f08-noShow.test.tsx` | planned | v1.1 |
| BR-09 (rev. 3.0) | F-05, F-08 | 2 | AC-26, AC-29 | NOSHOW-001, NOSHOW-003, NOSHOW-007, NOSHOW-020 | `server/tests/f08-no-show-rule.test.ts`, `server/tests/f08-no-show-recovery.test.ts` | passed (37fd6c0) | v1 |
| BR-01, BR-10 (F-05 cross-feature) | F-05, F-08 | 2 | AC-28, AC-31 | NOSHOW-006, NOSHOW-011 | `server/tests/f08-no-show-recovery.test.ts` | passed (37fd6c0) | v1 |
| BR-13 (F-07 cross-feature) | F-07, F-08 | 2 | AC-30 | NOSHOW-010 | `server/tests/f08-no-show-recovery.test.ts` | passed (37fd6c0) | v1 |
| BR-07, FR-03, NFR-02, NFR-08 | F-02, F-08 | 2 | AC-27 | NOSHOW-004, NOSHOW-005 | `server/tests/f08-no-show-recovery.test.ts` | passed (37fd6c0) | v1 |
| BR-12, NFR-03, NFR-05 | F-08 | 2 | AC-32 | NOSHOW-012, NOSHOW-013, NOSHOW-014 | `server/tests/f08-no-show-recovery.test.ts` | passed (37fd6c0) | v1 |
| FR-07, FR-13 | F-04, F-08 | 2 | AC-25, AC-34 | NOSHOW-002, NOSHOW-016, NOSHOW-018 | `server/tests/f08-no-show-recovery.test.ts`, `client/src/test/f08-noShow.test.tsx`, `e2e/tests/f08-no-show.spec.ts` | passed (37fd6c0) | v1 |
| NFR-06 | F-08 | 2 | AC-33 | NOSHOW-015, NOSHOW-019 | `client/src/test/f08-noShow.test.tsx`, `e2e/tests/f08-no-show.spec.ts` | passed (37fd6c0) | v1 |
| NFR-04 | F-08 | 2 | operations of AC-25, AC-28, AC-31 | PERF-S2-002 | `server/tests/nfr/perf-s2-002-no-show.ts` | passed (37fd6c0) | v1 |
| FR-01–FR-14 (regression) | F-06 | 2 | AC-01–AC-24 | REG-S2-002 | existing suites | passed (37fd6c0) | v1 |

### Acceptance criteria to tests

| Acceptance Criteria | Test ID(s) | Result |
|---|---|---|
| AC-25 | NOSHOW-002, NOSHOW-017 | passed (37fd6c0) |
| AC-26 | NOSHOW-001, NOSHOW-003, NOSHOW-020 | passed (37fd6c0) |
| AC-27 | NOSHOW-004, NOSHOW-005 | passed (37fd6c0) |
| AC-28 | NOSHOW-006, NOSHOW-017 | passed (37fd6c0) |
| AC-29 | NOSHOW-001, NOSHOW-007, NOSHOW-008, NOSHOW-017 | passed (37fd6c0) |
| AC-30 | NOSHOW-009, NOSHOW-010 | passed (37fd6c0) |
| AC-31 | NOSHOW-011 | passed (37fd6c0) |
| AC-32 | NOSHOW-012, NOSHOW-013, NOSHOW-014 | passed (37fd6c0) |
| AC-33 | NOSHOW-015, NOSHOW-017, NOSHOW-019 | passed (37fd6c0) |
| AC-34 | NOSHOW-016, NOSHOW-018 | passed (37fd6c0) |
| AC-45 | NOSHOW-021, NOSHOW-022, NOSHOW-023 | planned |

## Sprint 2 — F-09 Multi-counter Support Traceability

Contract v1.1 (2026-11-27, issue #42, SRS v4.1, author @Khwanklao, re-review pending by @TeekhathatTT; revised from v1 to address PR review). Every result below is `planned` until the test has been executed. Test specification: [sprints/sprint-2/tests.md §8](./sprints/sprint-2/tests.md#8-f-09-multi-counter-support).

### Requirements to tests

| Requirement | Feature | Sprint | AC | Test ID(s) | Planned test file | Result (commit) | Contract version |
|---|---|---|---|---|---|---|---|
| FR-17 | F-09 | 2 | AC-35, AC-36, AC-37, AC-42 | COUNTER-001–COUNTER-005, COUNTER-014, COUNTER-016, COUNTER-018 | `server/tests/f09-counter-rule.test.ts`, `server/tests/f09-multi-counter.test.ts`, `client/src/test/f09-multiCounter.test.tsx`, `e2e/tests/f09-multi-counter.spec.ts` | planned | v1.1 |
| FR-18 | F-09 | 2 | AC-37–AC-42 | COUNTER-001, COUNTER-005–COUNTER-012, COUNTER-014, COUNTER-016, COUNTER-017, COUNTER-018 | same four files | planned | v1.1 |
| FR-19 | F-09 | 2 | AC-38, AC-42, AC-43, AC-44 | COUNTER-006, COUNTER-014–COUNTER-018 | `server/tests/f09-multi-counter.test.ts`, `client/src/test/f09-multiCounter.test.tsx`, `e2e/tests/f09-multi-counter.spec.ts` | planned | v1.1 |
| BR-18 | F-09 | 2 | AC-35, AC-36, AC-37 | COUNTER-001–COUNTER-005, COUNTER-013 | `server/tests/f09-counter-rule.test.ts`, `server/tests/f09-multi-counter.test.ts` | planned | v1.1 |
| BR-19 (rev. 4.1) | F-09 | 2 | AC-38, AC-39, AC-40 | COUNTER-001, COUNTER-006–COUNTER-011 | same | planned | v1.1 |
| BR-20 (rev. 4.1) | F-09 | 2 | AC-38, AC-41 | COUNTER-006, COUNTER-009, COUNTER-012, COUNTER-013 | `server/tests/f09-multi-counter.test.ts` | planned | v1.1 |
| BR-10 (rev. 4.0 note) | F-05, F-09 | 2 | AC-39 | COUNTER-008, COUNTER-009 | `server/tests/f09-multi-counter.test.ts` | planned | v1.1 |
| BR-16 (rev. 4.0 note, F-08 cross-feature) | F-08, F-09 | 2 | AC-41 | COUNTER-012, COUNTER-017 | `server/tests/f09-multi-counter.test.ts`, `e2e/tests/f09-multi-counter.spec.ts` | planned | v1.1 |
| BR-14 (F-07 cross-feature) | F-07, F-09 | 2 | AC-41 | COUNTER-012 | `server/tests/f09-multi-counter.test.ts` | planned | v1.1 |
| BR-07, FR-03, NFR-02, NFR-08 | F-02, F-09 | 2 | AC-35, AC-37, AC-42, AC-43 | COUNTER-002, COUNTER-004, COUNTER-005, COUNTER-014, COUNTER-015 | `server/tests/f09-multi-counter.test.ts`, `client/src/test/f09-multiCounter.test.tsx` | planned | v1.1 |
| BR-12, NFR-03, NFR-05 | F-09 | 2 | AC-36, AC-40, AC-41 | COUNTER-003, COUNTER-010, COUNTER-011, COUNTER-013 | `server/tests/f09-multi-counter.test.ts` | planned | v1.1 |
| NFR-06 | F-09 | 2 | AC-42, AC-43 | COUNTER-014, COUNTER-015, COUNTER-018 | `client/src/test/f09-multiCounter.test.tsx`, `e2e/tests/f09-multi-counter.spec.ts` | planned | v1.1 |
| NFR-07 | F-01, F-09 | 2 | AC-44 | COUNTER-013 | `server/tests/f09-multi-counter.test.ts` | planned | v1.1 |
| NFR-04 | F-09 | 2 | AC-44 (operations of AC-35, AC-36, AC-38) | PERF-S2-003 | `server/tests/nfr/perf-s2-003-multi-counter.ts` | planned | v1.1 |
| FR-01–FR-16 (regression) | F-06 | 2 | AC-01–AC-34, AC-44 | REG-S2-003 | existing Sprint 1, F-07, and F-08 suites | planned | v1.1 |

### Acceptance criteria to tests

| Acceptance Criteria | Test ID(s) | Result |
|---|---|---|
| AC-35 | COUNTER-002, COUNTER-016 | planned |
| AC-36 | COUNTER-003, COUNTER-016 | planned |
| AC-37 | COUNTER-001, COUNTER-004, COUNTER-005 | planned |
| AC-38 | COUNTER-006, COUNTER-008, COUNTER-016 | planned |
| AC-39 | COUNTER-001, COUNTER-007, COUNTER-008, COUNTER-009, COUNTER-016, COUNTER-017 | planned |
| AC-40 | COUNTER-010, COUNTER-011 | planned |
| AC-41 | COUNTER-012, COUNTER-013, COUNTER-017 | planned |
| AC-42 | COUNTER-014, COUNTER-016, COUNTER-017, COUNTER-018 | planned |
| AC-43 | COUNTER-015, COUNTER-016, COUNTER-017, COUNTER-018 | planned |
| AC-44 | COUNTER-013, PERF-S2-003, REG-S2-003 | planned |
