# Sprint 1 Test Specification

This file describes the planned Sprint 1 validation contract. It does not claim that implementation has passed. The test categories are unit tests, database integration tests, API integration tests, and E2E tests.

## 1. Test matrix

| ID | Name | Expected result | Level |
|---|---|---|---|
| AUTH-001 | Customer login success | valid CUSTOMER session created | API integration |
| AUTH-002 | Operator login success | valid OPERATOR session created | API integration |
| AUTH-003 | Logout revokes session | protected requests fail after logout | API integration |
| AUTH-004 | Invalid credentials | generic 401 `UNAUTHORIZED` response | API integration |
| AUTH-005 | Authenticated identity and expired session | `/auth/me` returns the authenticated identity; expired sessions cannot access protected routes | API integration |
| SEC-001 | Password and secret handling | passwords use an approved salted adaptive hash; credentials, hashes, and session secrets are absent from API responses and application logs | Security / API integration |
| SEC-002 | CSRF and server-side authorization | state-changing cookie-authenticated requests reject missing or invalid CSRF tokens; server rejects unauthorized roles and queue assignments | Security / API integration |
| QUEUE-001 | OPEN queue listing | only OPEN queues are returned | API integration |
| QUEUE-002 | Join queue success | WAITING entry created with queue number and join timestamp | API integration |
| QUEUE-003 | Duplicate active join rejected | second active join returns `409 DUPLICATE_ACTIVE_ENTRY` | Database integration |
| QUEUE-004 | Closed queue rejection | closed queue join returns `409 QUEUE_NOT_AVAILABLE` | API integration |
| QUEUE-005 | Rejoin after completion | completed entry allows new entry creation | Database integration |
| QUEUE-006 | Privacy enforcement | customer can access only own entry | API integration |
| QUEUE-007 | FIFO operator listing | entries ordered by FIFO rule | API integration |
| QUEUE-008 | Customer joins multiple queues | customer may have one active entry in each of multiple distinct queues | API integration |
| NUMBER-001 | Queue-number uniqueness | numbers remain unique within the queue | Database integration |
| NUMBER-002 | Number allocation rollback | failed transaction does not persist a queue number | Database integration |
| API-001 | Malformed request rejection | malformed payloads and identifiers return 400 `INVALID_ARGUMENT` without a mutation | API integration |
| FLOW-001 | Call next selects oldest WAITING | oldest eligible row is moved to `CALLED` | Database integration |
| FLOW-002 | Call next transition | timestamp set and state moves to `CALLED` | API integration |
| FLOW-003 | Empty call next | 204 `No Content` and no mutation | API integration |
| FLOW-004 | Start transition | `CALLED -> SERVING` and timestamp set | API integration |
| FLOW-005 | Invalid lifecycle transition rejection | repeated or out-of-order transitions fail with `409 INVALID_STATE_TRANSITION` | API integration |
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
| CONCURRENCY-004 | Stale concurrent mutation | stale or conflicting mutations return the defined conflict response without corrupting lifecycle state | Database integration |
| PERF-001 | Local performance targets | on a seeded 1,000-entry database, 100 requests per operation meet p95 read <= 500 ms and mutation <= 1,000 ms | Performance |
| REL-001 | Commit durability | mutation success follows commit and committed records survive restart validation | Database integration |
| UI-001 | Responsive core workflows | customer and operator flows have no page-level horizontal overflow at 360 px and 1280 px | Browser E2E |
| SETUP-001 | Reproducible local setup | setup from a clean checkout creates required test accounts and queues without manual intervention | Manual verification |
| FLOW-009 | Customer E2E flow | login, join queue, view own detail | E2E |
| FLOW-010 | Operator E2E flow | login, call, start, complete | E2E |

## 2. Verification conditions

- All transitions must be validated against the lifecycle contract.
- All concurrency tests must run against the database, not mocked in-memory state.
- API error codes must match the contract in the SRS and the API specification.
- UI tests must verify usable behavior without horizontal overflow at 360 px and 1280 px.

## 3. Coverage summary

This plan maps to FR-01 through FR-13, BR-01 through BR-12, and NFR-01 through NFR-08 as detailed in [../../traceability.md](../../traceability.md). The IDs describe planned verification only; no test is claimed as passed unless the implementation provides evidence from a real run.
