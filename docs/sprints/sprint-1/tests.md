# Sprint 1 Test Specification

This document defines the planned validation contract for Sprint 1. It does not claim that any implementation has passed; it describes the acceptance conditions that must be verified in real runs against the application and database.

## 1. Test format and conventions

All important tests follow the same structure:

1. Test ID
2. Test Name
3. Test Level
4. Preconditions
5. Input / Test Data
6. Execution Steps
7. Expected HTTP Status
8. Expected Response Body
9. Expected Database Side Effects
10. Pass Criteria

Use the standard API error envelope and the Sprint 1 contract in [../srs.md](../srs.md), [../system-sds.md](../system-sds.md), and [../sprints/sprint-1/api-spec.md](./api-spec.md).

## 2. Test matrix

| ID | Name | Expected result | Level |
|---|---|---|---|
| AUTH-001 | Customer login success | valid CUSTOMER session created | API integration |
| AUTH-002 | Operator login success | valid OPERATOR session created | API integration |
| AUTH-003 | Logout revokes session | protected requests fail after logout | API integration |
| AUTH-004 | Invalid credentials | generic `401 UNAUTHORIZED` response | API integration |
| AUTH-005 | Authenticated identity and expired session | `/auth/me` returns identity; expired sessions cannot access protected routes | API integration |
| SEC-001 | Password and secret handling | passwords are salted and never returned to the UI or API; secrets remain absent from logs | Security / API integration |
| SEC-002 | CSRF enforcement | missing or invalid CSRF tokens are rejected before mutation | Security / API integration |
| QUEUE-001 | OPEN queue listing | only OPEN queues are returned | API integration |
| QUEUE-002 | Join queue success | a `WAITING` entry is created with queue number and join timestamp | API integration |
| QUEUE-003 | Duplicate active join rejected | second active join returns `409 DUPLICATE_ACTIVE_ENTRY` | Database integration |
| QUEUE-004 | Closed queue rejection | closed queue join returns `409 QUEUE_NOT_AVAILABLE` | API integration |
| QUEUE-005 | Rejoin after completion | completed entry may be rejoined later | Database integration |
| QUEUE-006 | Privacy enforcement | customer can access only own entry | API integration |
| QUEUE-007 | FIFO operator listing | entries ordered according to FIFO rule | API integration |
| QUEUE-008 | Customer joins multiple queues | one active entry per customer per queue is allowed across distinct queues | API integration |
| NUMBER-001 | Queue-number uniqueness | numbers remain unique within the queue | Database integration |
| NUMBER-002 | Number allocation rollback | failed transaction does not persist a queue number | Database integration |
| API-001 | Malformed request rejection | malformed payloads and identifiers return `400 INVALID_ARGUMENT` without mutation | API integration |
| FLOW-001 | Call next selects oldest WAITING | oldest eligible row is moved to `CALLED` | Database integration |
| FLOW-002 | Call next transition | timestamp set and state moves to `CALLED` | API integration |
| FLOW-003 | Empty call next | `204 No Content` and no mutation | API integration |
| FLOW-004 | Start transition | `CALLED -> SERVING` and timestamp set | API integration |
| FLOW-005 | Invalid lifecycle transition rejection | repeated or out-of-order transitions fail with `409 INVALID_STATE_TRANSITION` | API integration |
| FLOW-006 | Complete transition | `SERVING -> COMPLETED` and timestamp set | API integration |
| FLOW-007 | Completed terminal guard | repeated completion attempts fail | API integration |
| RBAC-001 | Customer cannot call next | `403 FORBIDDEN` | API integration |
| RBAC-002 | Customer cannot start | `403 FORBIDDEN` | API integration |
| RBAC-003 | Customer cannot complete | `403 FORBIDDEN` | API integration |
| RBAC-004 | Operator assignment enforcement | unassigned queue access fails | API integration |
| RBAC-005 | Cross-owner entry access denied | customer request to another customer's entry fails | API integration |
| CONCURRENCY-001 | Parallel queue join race | all queue numbers remain unique under concurrent join attempts | Database integration |
| CONCURRENCY-002 | Duplicate active entry race | only one active row survives under concurrent duplicate joins | Database integration |
| CONCURRENCY-003 | Call-next race | concurrent call-next requests claim different entries correctly | Database integration |
| CONCURRENCY-004 | Stale concurrent mutation | stale mutation returns conflict response without corrupting state | Database integration |
| PERF-001 | Local performance targets | p95 read and mutation timings meet Sprint 1 local targets | Performance |
| REL-001 | Commit durability | successful mutation persists after commit and survives restart validation | Database integration |
| UI-001 | Responsive core workflows | pages remain usable at 360 px and 1280 px without horizontal overflow | Browser E2E |
| SETUP-001 | Reproducible local setup | clean checkout can provision required test accounts and queues | Manual verification |
| FLOW-009 | Customer E2E flow | login, join queue, view own detail | E2E |
| FLOW-010 | Operator E2E flow | login, call, start, complete | E2E |

## 3. Detailed test cases for critical behaviors

### AUTH-001 — Customer Login Success
**Test Level:** API Integration Test

**Preconditions:**
- A valid customer account exists in the seeded test data.
- The customer account is active and has role `CUSTOMER`.

**Input:**
- `POST /api/auth/login` with a valid email and password.

**Execution Steps:**
1. Send a login request with valid credentials.
2. Inspect the response headers and body.
3. Confirm the session cookie is set.
4. Call `/api/auth/me` using the same cookie.

**Expected HTTP Status:**
- `200 OK` for both login and `/auth/me`

**Expected Response Body:**
- Login response includes `data.user` with `id`, `email`, and `role: "CUSTOMER"`.
- `/auth/me` returns the same authenticated identity.

**Expected Database Side Effects:**
- No queue or queue-entry row is created or modified.
- Session data is created server-side, but no user-private data is returned.

**Pass Criteria:**
- The user authenticates successfully and the authenticated session is recognized by the server.

### SEC-002 — CSRF Enforcement for State-Changing Requests
**Test Level:** Security / API Integration Test

**Preconditions:**
- A valid customer session is established.
- The API is configured to require `X-CSRF-Token` for authenticated mutations.

**Input:**
- A join-queue request without `X-CSRF-Token`.

**Execution Steps:**
1. Authenticate as a customer.
2. Request the queue catalog to obtain a valid CSRF token if the flow requires one.
3. Submit a queue-entry creation request without the token.
4. Inspect the HTTP response and server-side state.

**Expected HTTP Status:**
- `403 Forbidden`

**Expected Response Body:**
- Error code is `FORBIDDEN`.
- Response body follows the standard error envelope.
- The response does not disclose internal implementation details.

**Expected Database Side Effects:**
- No queue-entry row is created.
- No `lastQueueNumber` counter is mutated.

**Pass Criteria:**
- The mutant request is rejected before any state change is applied.

### QUEUE-003 — Duplicate Active Join Rejected
**Test Level:** Database Integration Test

**Preconditions:**
- Queue `Q` exists and is `OPEN`.
- Customer `C` already has one active queue entry in `Q` with status `WAITING`, `CALLED`, or `SERVING`.

**Input:**
- Customer `C` submits a second join request for `Q`.

**Execution Steps:**
1. Authenticate as `C`.
2. Send `POST /api/queues/{queueId}/entries` for the same `Q`.
3. Inspect the API response.
4. Query the database to verify the number of active entries remains exactly one.

**Expected HTTP Status:**
- `409 Conflict`

**Expected Response Body:**
- Error code: `DUPLICATE_ACTIVE_ENTRY`
- Response follows the standard error envelope.

**Expected Database Side Effects:**
- No additional active queue entry is inserted.
- `lastQueueNumber` remains unchanged.

**Pass Criteria:**
- The second active join is rejected and the database enforces the active-entry uniqueness rule.

### RBAC-004 — Operator Cannot Access an Unassigned Queue
**Test Level:** API Integration Test

**Preconditions:**
- Operator A is authenticated.
- Queue Q exists and is assigned to Operator B.
- Operator A is not assigned to Q.

**Input:**
- Operator A requests `GET /api/operator/queues/{queueId}/entries` for Q.

**Execution Steps:**
1. Authenticate as Operator A.
2. Call the queue-detail endpoint using Q's ID.
3. Check the HTTP status.
4. Confirm the database remains unchanged.

**Expected HTTP Status:**
- `403 Forbidden`

**Expected Response Body:**
- Error code: `FORBIDDEN`
- Response follows the standard error envelope.

**Expected Database Side Effects:**
- No queue state or queue-entry row is modified.
- No audit or lifecycle row changes occur.

**Pass Criteria:**
- The API rejects the request and produces no unauthorized database side effects.

### RBAC-005 — Customer Attempts to Access Another Customer's Entry
**Test Level:** API Integration Test

**Preconditions:**
- Customer A is authenticated.
- Customer B has an existing queue entry with ID E.
- Customer A does not own E.

**Input:**
- Customer A requests `GET /api/me/queue-entries/{entryId}` using E.

**Execution Steps:**
1. Authenticate as Customer A.
2. Send the request to fetch the entry details of E.
3. Inspect the HTTP response.
4. Verify that no private information from B is exposed.

**Expected HTTP Status:**
- `404 Not Found`

**Expected Response Body:**
- Error code: `RESOURCE_NOT_FOUND`
- The message is safe and generic; it does not reveal the existence of Customer B's private resource.

**Expected Database Side Effects:**
- No queue-entry data is modified.
- No additional rows are created.

**Pass Criteria:**
- Customer A receives the same privacy-safe response as an unknown or missing resource, and no other customer data is revealed.

### FLOW-003 — Empty Call Next Returns 204 No Content
**Test Level:** API Integration Test

**Preconditions:**
- Operator O is authenticated and assigned to Queue Q.
- Queue Q exists and has no `WAITING` entries.

**Input:**
- `POST /api/operator/queues/{queueId}/call-next` for Q.

**Execution Steps:**
1. Authenticate as Operator O.
2. Call `call-next` for Q.
3. Check the response code and body.
4. Query the database to confirm no queue-entry state changed.

**Expected HTTP Status:**
- `204 No Content`

**Expected Response Body:**
- No response body is present.

**Expected Database Side Effects:**
- No queue-entry row is updated.
- No lifecycle timestamp is changed.

**Pass Criteria:**
- The call-next operation is idempotent when the queue is empty and leaves the queue state unchanged.

### NUMBER-001 — Queue Number Uniqueness Under Parallel Join Requests
**Test Level:** Database Integration Test

**Preconditions:**
- Queue Q exists and is `OPEN`.
- Multiple customers attempt to join Q concurrently.

**Input:**
- Parallel `POST /api/queues/{queueId}/entries` requests from distinct customers.

**Execution Steps:**
1. Launch concurrent join requests for Q.
2. Wait for all transactions to complete.
3. Query `QueueEntry` rows for Q and inspect `queueNumber` values.

**Expected HTTP Status:**
- Each successful request returns `201 Created`.
- Any rejected requests return the appropriate `409` conflict code.

**Expected Response Body:**
- Successful requests include unique `queueNumber` values.
- Failed requests follow the standard error envelope.

**Expected Database Side Effects:**
- All inserted rows for Q have unique `queueNumber` values within the queue.
- `lastQueueNumber` is incremented safely and remains non-decreasing.

**Pass Criteria:**
- No duplicate queue numbers are persisted under concurrent access.

### API-001 — Malformed UUID Rejected With 400 INVALID_ARGUMENT
**Test Level:** API Integration Test

**Preconditions:**
- A valid authenticated session exists.

**Input:**
- A request to `GET /api/me/queue-entries/not-a-uuid` or other malformed path parameter.

**Execution Steps:**
1. Authenticate as any valid user.
2. Send a request with an invalid UUID path value.
3. Inspect the response.
4. Check whether any database row was modified.

**Expected HTTP Status:**
- `400 Bad Request`

**Expected Response Body:**
- Error code: `INVALID_ARGUMENT`
- Response uses the standard error envelope.

**Expected Database Side Effects:**
- No mutation occurs.
- No queue or queue-entry row is changed.

**Pass Criteria:**
- A malformed identifier is rejected as invalid input and not treated as a missing-resource case.

## 4. Verification conditions

- All state transition tests must validate the lifecycle contract: `WAITING -> CALLED -> SERVING -> COMPLETED`.
- All concurrency tests must exercise real database transactions, not mocked in-memory state.
- All API error codes must match the contract in the SRS, system SDS, and API specification.
- Customer privacy tests must verify that cross-owner reads return `404 RESOURCE_NOT_FOUND` and never reveal other-user data.
- UI tests must validate usability and responsiveness at 360 px and 1280 px without horizontal overflow.

## 5. Coverage summary

This test plan maps to FR-01 through FR-13, BR-01 through BR-12, and NFR-01 through NFR-08 as defined in [../../traceability.md](../../traceability.md). The IDs describe planned verification only; no test is claimed as passed unless the implementation provides evidence from a real execution.

