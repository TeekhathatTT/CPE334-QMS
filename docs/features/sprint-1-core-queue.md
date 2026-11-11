# Feature SDS: Sprint 1 Core Queue

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
- a customer may not have more than one active entry in the same queue
- `Call Next` only selects `WAITING` entries
- valid state transitions are `WAITING -> CALLED -> SERVING -> COMPLETED`
- an empty queue returns `204 No Content`

## Validation and error handling

The operations must follow the API contract in [../sprints/sprint-1/api-spec.md](../sprints/sprint-1/api-spec.md). Invalid transitions return `409 INVALID_STATE_TRANSITION`; unauthenticated requests return `401 UNAUTHORIZED`; unauthorized operator actions return `403 FORBIDDEN`; and cross-owner customer lookups return `404 RESOURCE_NOT_FOUND`.