# Sprint 1 Test Specification

This file describes the planned Sprint 1 validation contract. It does not claim that implementation has passed. The test categories are unit tests, database integration tests, API integration tests, and E2E tests.

## 1. Test matrix

| ID | Name | Expected result | Level |
|---|---|---|---|
| AUTH-001 | Customer login success | valid CUSTOMER session created | API integration |
| AUTH-002 | Operator login success | valid OPERATOR session created | API integration |
| AUTH-003 | Logout revokes session | protected requests fail after logout | API integration |
| AUTH-004 | Invalid credentials | generic 401 `UNAUTHORIZED` response | API integration |
| QUEUE-001 | OPEN queue listing | only OPEN queues are returned | API integration |
| QUEUE-002 | Join queue success | WAITING entry created with queue number and join timestamp | API integration |
| QUEUE-003 | Duplicate active join rejected | second active join returns `409 DUPLICATE_ACTIVE_ENTRY` | Database integration |
| QUEUE-004 | Closed queue rejection | closed queue join returns `409 QUEUE_NOT_AVAILABLE` | API integration |
| QUEUE-005 | Rejoin after completion | completed entry allows new entry creation | Database integration |
| QUEUE-006 | Privacy enforcement | customer can access only own entry | API integration |
| QUEUE-007 | FIFO operator listing | entries ordered by FIFO rule | API integration |
| NUMBER-001 | Queue-number uniqueness | numbers remain unique within the queue | Database integration |
| NUMBER-002 | Number allocation rollback | failed transaction does not persist a queue number | Database integration |
| FLOW-001 | Call next selects oldest WAITING | oldest eligible row is moved to `CALLED` | Database integration |
| FLOW-002 | Call next transition | timestamp set and state moves to `CALLED` | API integration |
| FLOW-003 | Empty call next | 204 `No Content` and no mutation | API integration |
| FLOW-004 | Start transition | `CALLED -> SERVING` and timestamp set | API integration |
| FLOW-005 | Start repeat rejection | second start attempt fails with `409 INVALID_STATE_TRANSITION` | API integration |
| FLOW-006 | Complete transition | `SERVING -> COMPLETED` and timestamp set | API integration |
| FLOW-007 | Completed terminal guard | repeated completion attempts fail | API integration |
| RBAC-001 | Customer cannot call next | 403 `FORBIDDEN` | API integration |
| RBAC-002 | Customer cannot start | 403 `FORBIDDEN` | API integration |
| RBAC-003 | Customer cannot complete | 403 `FORBIDDEN` | API integration |
| RBAC-004 | Operator assignment enforcement | unassigned queue access fails | API integration |
| RBAC-005 | Cross-owner entry access denied | customer request to another customer's entry fails | API integration |
| CONCURRENCY-001 | Parallel queue join race | all queue numbers are unique under concurrency | Database integration |
| CONCURRENCY-002 | Duplicate active entry race | only one active row survives | Database integration |
| CONCURRENCY-003 | Call-next race | concurrent call-next actions claim different entries | Database integration |
| FLOW-009 | Customer E2E flow | login, join queue, view own detail | E2E |
| FLOW-010 | Operator E2E flow | login, call, start, complete | E2E |

## 2. Verification conditions

- All transitions must be validated against the lifecycle contract.
- All concurrency tests must run against the database, not mocked in-memory state.
- API error codes must match the contract in the SRS and the API specification.
- UI tests must verify usable behavior without horizontal overflow at 360 px and 1280 px.

## 3. Coverage summary

The tests cover FR-01 through FR-13, BR-01 through BR-12, and the NFR targets for security, data integrity, and responsiveness. The validation must not claim any test as passed unless the implementation has evidence from a real run.