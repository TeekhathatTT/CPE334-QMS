# Sprint 1 API Specification

Base path `/api`; JSON UTF-8; timestamps RFC 3339 UTC. Session cookie authentication (opaque server-side session) is the design proposal in `system-design.md`; mutations also require CSRF token/header. Never trust user/role IDs from request bodies. List responses are deterministic. API errors use the single shape below.

## Common response and errors

Success resources are wrapped as `{"data": <object-or-array>}` except 204. Error: `{"error":{"code":"INVALID_ARGUMENT","message":"Request is invalid.","requestId":"...","details":[]}}`. `details` may contain field names and safe validation codes, never secrets or another customer's data.

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_ARGUMENT` | Malformed ID, body, query or validation failure |
| 401 | `UNAUTHENTICATED` | Missing, invalid or expired session; invalid login uses `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` | Authenticated but role lacks permission; operator queue not assigned |
| 404 | `RESOURCE_NOT_FOUND` | Unknown resource; customer cross-owner lookup is deliberately masked |
| 409 | `QUEUE_NOT_AVAILABLE`, `DUPLICATE_ACTIVE_ENTRY`, `INVALID_STATE_TRANSITION`, `CONCURRENT_MODIFICATION` | Business rule or stale concurrent state |
| 500 | `INTERNAL_ERROR` | Unexpected failure; generic message plus request ID |

No 422 is used; structurally valid requests with business conflicts use 409. Login failures deliberately use 401. Queue number scope/reset is pending BR-02–04 approval; contract uses `queueNumber` as an opaque positive integer pending that decision.

## Authentication

| Method / URL | Auth / role / permission | Input | Success | Errors / validation | Trace |
|---|---|---|---|---|---|
| POST `/auth/login` | None | `{email,password}`; both required strings, email normalized | 200 `{data:{user:{id,email,role},csrfToken}}`; set session cookie | 400 malformed; 401 `INVALID_CREDENTIALS` for bad password/unknown/disabled; generic text | FR-01; AC-01,02 |
| POST `/auth/logout` | Session; any role; current session | CSRF header; no body | 204, revoke session and clear cookie | 401 unauthenticated; 403 CSRF | FR-02; AC-01,03 |
| GET `/auth/me` | Session; any role | None | 200 `{data:{user:{id,email,role}}}` | 401 | FR-02; AC-01,03 |

## Customer

| Method / URL | Auth / role / permission | Input | Success | Errors / validation | Trace |
|---|---|---|---|---|---|
| GET `/queues` | Session; CUSTOMER or OPERATOR (catalog is read-only) | No parameters | 200 `{data:[{id,name,description,availability}]}`; OPEN queues only; no customer data | 401; 500 | FR-04; BR-08; AC-06 |
| POST `/queues/{queueId}/entries` | Session, CUSTOMER, join open queue | Path UUID; `{}` body; CSRF | 201 `{data:{id,serviceQueue:{id,name},queueNumber,status,joinedAt}}`; status WAITING | 400 malformed ID/body; 401; 403 role; 404 unknown queue; 409 closed/duplicate; 500 | FR-05,06,12,13; BR-02–05,08; AC-07–09 |
| GET `/me/queue-entries` | Session, CUSTOMER, own entries | Optional `status` enum and `limit` 1–100 (default 50), `cursor` opaque | 200 `{data:[entrySummary],page:{nextCursor}}`; newest join first | 400 invalid query; 401; 403 role | FR-07; BR-07; AC-10 |
| GET `/me/queue-entries/{entryId}` | Session, CUSTOMER, owner only | Path UUID | 200 `{data:entryDetail}` | 400 malformed; 401; 403 role; 404 unknown or not owned | FR-07,13; BR-07; AC-05,10 |

`entrySummary` fields: `id, serviceQueue:{id,name}, queueNumber, status, joinedAt, calledAt, serviceStartedAt, completedAt`. Detail has same fields. Neither includes customer ID/email/name/contact. Null lifecycle timestamps remain null.

## Operator

| Method / URL | Auth / role / permission | Input | Success | Errors / validation | Trace |
|---|---|---|---|---|---|
| GET `/operator/queues` | Session, OPERATOR | None | 200 `{data:[{id,name,description,availability}]}` assigned queues only | 401; 403 role | FR-03,08; BR-07; AC-04 |
| GET `/operator/queues/{queueId}/entries` | Session, OPERATOR, assigned queue | Optional `status` enum; `limit` 1–100 default 50; cursor | 200 `{data:[operatorEntry],page:{nextCursor}}`; ordered joinedAt/id | 400; 401; 403 role/unassigned; 404 unknown queue | FR-03,08; BR-01,07; AC-04,11 |
| POST `/operator/queues/{queueId}/call-next` | Session, OPERATOR, assigned queue | `{}` body; CSRF | 200 `{data:operatorEntry}` after atomic WAITING→CALLED; 204 when empty | 400; 401; 403; 404 queue; 409 concurrent modification | FR-09,12,13; BR-01,09,10–12; AC-11–13 |
| POST `/operator/queue-entries/{entryId}/start` | Session, OPERATOR assigned to entry's queue | `{}` body; CSRF | 200 `{data:operatorEntry}` CALLED→SERVING | 400; 401; 403; 404; 409 invalid state/concurrent | FR-10,12,13; BR-07,09,11,12; AC-14,16 |
| POST `/operator/queue-entries/{entryId}/complete` | Session, OPERATOR assigned to entry's queue | `{}` body; CSRF | 200 `{data:operatorEntry}` SERVING→COMPLETED | 400; 401; 403; 404; 409 invalid state/concurrent | FR-11–13; BR-07,09,11,12; AC-15,16 |

`operatorEntry` fields: `id,serviceQueue:{id,name},queueNumber,status,joinedAt,calledAt,serviceStartedAt,completedAt,customer:{id,displayName?}`. Email, phone and other account/private data are excluded. Any `displayName` is optional and requires product approval; minimum supported field is customer ID. `GET /operator/queues/{queueId}/entries` includes completed history when no status filter; Call Next eligibility is only WAITING.

## Cross-cutting validation and transaction rules

- Unknown JSON fields are rejected with 400 rather than silently accepted. Empty object is required for action POSTs to simplify consistent validation.
- Maximum page size 100. Invalid status enum, limit outside 1–100 or malformed cursor is 400.
- Operator assignment is checked before returning queue entries or mutating state. Customer ownership is checked before serialization; cross-owner and unknown detail have identical 404 shape.
- Join transaction serializes queue-number allocation and active duplicate guard; database uniqueness backs both. Call Next locks/claims one FIFO WAITING row. Start/complete condition on expected status and update timestamp atomically.
- Empty Call Next is a normal 204 and has no error envelope. Retrying a mutation does not silently replay a different state change: repeated state operations return 409.
