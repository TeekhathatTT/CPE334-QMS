# Feature SDS: Sprint 1 Core Queue

> **Version:** 1.1 | **Last Updated:** 2026-11-27 | **Sprint 1 Baseline:** commit `e304cd9` (`main`), deployed revision `qms-00005-5kz` | **Change Ref:** Issue #51 (Lab 7 Part A — BR-06)

## Purpose and scope

This feature covers the minimum end-to-end queue workflow for Sprint 1: customer join, operator call-next processing, and lifecycle transitions for queue entries. It depends on the authentication and persistence foundations documented in the SRS and the Sprint plan. The governing requirement set is defined in [../srs.md](../srs.md).

## Customer workflow

1. log in as CUSTOMER
2. view the OPEN queue catalog
3. join an OPEN queue
4. receive the assigned queue number and waiting status
5. view only the customer's own entry record

## Operator workflow

1. log in as OPERATOR
2. view the assigned queue list
3. inspect queue entries in FIFO order
4. call the next eligible waiting entry
5. start and complete service in the required lifecycle order

## Business logic

- only `OPEN` queues are joinable by customers
- queue numbers are assigned per queue and are unique within that queue
- a customer may not have more than one active entry (`WAITING`, `CALLED`, or `SERVING`) in the same queue (`BR-05`)
- a customer may hold at most **2 active entries** (`WAITING`, `CALLED`, or `SERVING`) across all queues simultaneously (`BR-06`, Issue #51); terminal entries (`COMPLETED`, and future `CANCELLED`/`NO_SHOW` once implemented) do not count toward this cap and free a slot for joining a new `OPEN` queue
- `Call Next` only selects `WAITING` entries
- valid state transitions are `WAITING -> CALLED -> SERVING -> COMPLETED`
- an empty queue returns `204 No Content`

## Validation and error handling

The operations must follow the API contract in [../sprints/sprint-1/api-spec.md](../sprints/sprint-1/api-spec.md). Same-queue duplicate active joins return `409 DUPLICATE_ACTIVE_ENTRY` (checked before the cross-queue cap so `BR-05` / AC-4 takes precedence); attempting to join a 3rd `OPEN` queue while already holding 2 active entries returns `409 MAX_ACTIVE_ENTRIES_REACHED` (`BR-06` / AC-2) with no entry persisted and `lastQueueNumber` unchanged; closed queues return `409 QUEUE_NOT_AVAILABLE`; invalid transitions return `409 INVALID_STATE_TRANSITION`; unauthenticated requests return `401 UNAUTHORIZED`; unauthorized operator actions return `403 FORBIDDEN`; and cross-owner customer lookups return `404 RESOURCE_NOT_FOUND`.

## Revision History

| Version | Date | Ref | Summary of Changes |
|---|---|---|---|
| 1.0 | 2026-11-11 | Sprint 1 Baseline | Initial Core Queue Feature SDS (accepted at commit `e304cd9`, Cloud Run revision `qms-00005-5kz`). |
| 1.1 | 2026-11-27 | Issue #51 (Lab 7 Part A) | Added `BR-06` cross-queue cap of 2 active entries per customer across all queues, `409 MAX_ACTIVE_ENTRIES_REACHED` error contract, and `DUPLICATE_ACTIVE_ENTRY` precedence rule (AC-1–AC-4). |