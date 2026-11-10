# Sprint 1 API Specification

## 1. Common conventions

- Base path: `/api`
- JSON payloads use UTF-8
- Timestamps are RFC 3339 UTC
- Authentication uses an HTTP-only session cookie
- CSRF protection is required for state-changing requests
- Successful responses with a JSON body use a `data` envelope; list payloads are contained in `data`, and no pagination contract is defined for Sprint 1
- Responses with status `204 No Content` have no body
- Errors with a response body follow the standardized envelope: `{"error":{"code":"INVALID_ARGUMENT","message":"Request is invalid.","requestId":"..."}}`
- The API does not reveal another customer's private data

## 2. Standard error contract

| HTTP | Error code | Meaning |
|---|---|---|
| 400 | `INVALID_ARGUMENT` | Malformed ID, payload, query, or validation failure |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired session |
| 403 | `FORBIDDEN` | Authenticated user lacks permission or is not assigned to the queue |
| 404 | `RESOURCE_NOT_FOUND` | Unknown resource or cross-owner customer data access |
| 409 | `QUEUE_NOT_AVAILABLE` | Queue is closed or not eligible for join |
| 409 | `DUPLICATE_ACTIVE_ENTRY` | Customer already has an active entry in the same queue |
| 409 | `INVALID_STATE_TRANSITION` | The requested status transition is illegal |
| 409 | `CONCURRENT_MODIFICATION` | A stale or conflicting mutation was attempted |
| 500 | `INTERNAL_ERROR` | Unexpected server failure |

For the customer privacy case, a lookup of another customer's entry returns `404 RESOURCE_NOT_FOUND` and does not reveal whether the resource exists. A 404 is never used for unauthenticated requests.

## 3. Authentication endpoints

| Method | Route | Role | Success | Errors |
|---|---|---|---|---|
| POST | `/auth/login` | anonymous | 200 with `{data:{user:{id,email,role}}}` and session cookie | 400 invalid payload; 401 `UNAUTHORIZED` for invalid credentials |
| POST | `/auth/logout` | any authenticated user | 204 with session invalidation | 401 `UNAUTHORIZED` |
| GET | `/auth/me` | any authenticated user | 200 with `{data:{user:{id,email,role}}}` | 401 `UNAUTHORIZED` |

## 4. Customer requests

| Method | Route | Role | Success | Errors |
|---|---|---|---|---|
| GET | `/queues` | CUSTOMER or OPERATOR | 200 with list of OPEN queues | 401 `UNAUTHORIZED` |
| POST | `/queues/{queueId}/entries` | CUSTOMER | 201 with queue entry details and assigned queue number | 400 invalid payload; 401 `UNAUTHORIZED`; 403 `FORBIDDEN` if wrong role; 404 unknown queue; 409 `QUEUE_NOT_AVAILABLE` or `DUPLICATE_ACTIVE_ENTRY` |
| GET | `/me/queue-entries` | CUSTOMER | 200 with own queue entries | 400 invalid query; 401 `UNAUTHORIZED` |
| GET | `/me/queue-entries/{entryId}` | CUSTOMER | 200 with own entry details | 400 invalid ID; 401 `UNAUTHORIZED`; 404 `RESOURCE_NOT_FOUND` if not owned or missing |

Entry data contains the queue number, status, and lifecycle timestamps. It does not expose other customers' information.

## 5. Operator requests

| Method | Route | Role | Success | Errors |
|---|---|---|---|---|
| GET | `/operator/queues` | OPERATOR | 200 with assigned queues | 401 `UNAUTHORIZED`; 403 `FORBIDDEN` if not permitted |
| GET | `/operator/queues/{queueId}/entries` | OPERATOR assigned to queue | 200 with FIFO-ordered queue entries | 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `RESOURCE_NOT_FOUND` if queue missing |
| POST | `/operator/queues/{queueId}/call-next` | OPERATOR assigned to queue | 200 with `CALLED` entry, or 204 if no eligible entry | 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `RESOURCE_NOT_FOUND`; 409 `INVALID_STATE_TRANSITION` or `CONCURRENT_MODIFICATION` |
| POST | `/operator/queue-entries/{entryId}/start` | OPERATOR assigned to entry's queue | 200 with `SERVING` entry | 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `RESOURCE_NOT_FOUND`; 409 `INVALID_STATE_TRANSITION` |
| POST | `/operator/queue-entries/{entryId}/complete` | OPERATOR assigned to entry's queue | 200 with `COMPLETED` entry | 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `RESOURCE_NOT_FOUND`; 409 `INVALID_STATE_TRANSITION` |

## 6. State and Transaction Rules

- Queue ordering is `joinedAt ASC, id ASC`.
- Only entries with status `WAITING` are eligible for call-next.
- At most one active entry per customer per queue.
- Queue numbers are positive integers unique within the queue.
- Number generation and entry insert occur within the same transaction.
- Queue and entry status updates are committed atomically with their lifecycle timestamp.

## 7. Traceability

This API contract supports FR-01 to FR-13, BR-01 to BR-12, and the Sprint 1 acceptance criteria defined in the SRS and test specification.