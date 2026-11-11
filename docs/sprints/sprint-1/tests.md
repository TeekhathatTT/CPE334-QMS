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
| NUMBER-001 | Queue-number uniqueness and sequential order | successful sequential joins receive the next positive number without duplicates within the queue | API integration / Database integration |
| NUMBER-002 | Number allocation rollback | failed transaction does not persist a queue number | Database integration |
| API-001 | Malformed request rejection | malformed payloads and identifiers return `400 INVALID_ARGUMENT` without mutation | API integration |
| FLOW-001 | Call next selects oldest WAITING | oldest eligible row is moved to `CALLED` | Database integration |
| FLOW-002 | Call next successfully transitions WAITING to CALLED | selected WAITING entry changes to `CALLED` and `calledAt` is set | API integration / Database integration |
| FLOW-003 | Empty call next | `204 No Content` and no mutation | API integration |
| FLOW-004 | Start service successfully transitions CALLED to SERVING | selected called entry changes to `SERVING` and `serviceStartedAt` is set | API integration / Database integration |
| FLOW-005 | Invalid lifecycle transition rejection | repeated or out-of-order transitions fail with `409 INVALID_STATE_TRANSITION` | API integration |
| FLOW-006 | Complete transition | `SERVING -> COMPLETED` and timestamp set | API integration |
| FLOW-007 | Completed terminal guard | repeated completion attempts fail | API integration |
| RBAC-001 | Customer cannot call next | `403 FORBIDDEN` | API integration |
| RBAC-002 | Customer cannot start | `403 FORBIDDEN` | API integration |
| RBAC-003 | Customer cannot complete | `403 FORBIDDEN` | API integration |
| RBAC-004 | Operator assignment enforcement | unassigned queue access fails | API integration |
| RBAC-005 | Cross-owner entry access denied | customer request to another customer's entry fails | API integration |
| CONCURRENCY-001 | Parallel queue join race condition | concurrent join requests preserve unique queue numbers and consistent active entries | Database concurrency / API integration |
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

### FLOW-002 — Call Next Successfully Transitions WAITING to CALLED
**Test Level:** API Integration Test / Database Integration Test

**Preconditions:**
- An authenticated operator is assigned to Queue Q.
- Queue Q is `OPEN`.
- Queue Q contains at least one entry with status `WAITING`.
- The target entry is the earliest eligible waiting entry according to FIFO ordering.
- The entry does not already have a `calledAt` timestamp.

**Input:**
- `POST /api/operator/queues/{queueId}/call-next` with `Request Body: None`.

**Execution Steps:**
1. Authenticate as the assigned operator.
2. Prepare at least two waiting entries with distinct `joinedAt` values.
3. Send the call-next request for Queue Q.
4. Inspect the HTTP status and response body.
5. Query the database to verify the affected entry and remaining entries.

**Expected HTTP Status:**
- `200 OK`

**Expected Response Body:**
- Response matches the success schema in `api-spec.md`.
- The selected entry’s status changes from `WAITING` to `CALLED`.
- `calledAt` is set to a valid RFC 3339 UTC timestamp.
- Other waiting entries remain unchanged.

**Expected Database Side Effects:**
- Exactly one row transitions from `WAITING` to `CALLED`.
- The selected row gets a non-null `calledAt` timestamp.
- No duplicate queue entries are created.

**Pass Criteria:**
- The correct FIFO entry is selected.
- The status transition is persisted.
- `calledAt` is populated and uses the documented timestamp format.
- The response matches the persisted database state.

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

### FLOW-004 — Start Service Successfully Transitions CALLED to SERVING
**Test Level:** API Integration Test / Database Integration Test

**Preconditions:**
- An authenticated operator is assigned to Queue Q.
- Queue Q contains an entry with status `CALLED`.
- The entry was successfully called previously and is eligible to start service.

**Input:**
- `POST /api/operator/queue-entries/{entryId}/start` with `Request Body: None`.

**Execution Steps:**
1. Authenticate as the assigned operator.
2. Prepare an entry in `CALLED` status.
3. Send the start-service request for that entry.
4. Inspect the HTTP response.
5. Query the database to verify the row state.

**Expected HTTP Status:**
- `200 OK`

**Expected Response Body:**
- Response matches the success schema in `api-spec.md`.
- The entry status changes from `CALLED` to `SERVING`.
- `serviceStartedAt` is populated.
- `calledAt` remains unchanged.

**Expected Database Side Effects:**
- The target row transitions to `SERVING`.
- `serviceStartedAt` is set to a valid RFC 3339 UTC timestamp.
- No unrelated queue-entry rows are modified.

**Pass Criteria:**
- The transition is persisted correctly.
- `serviceStartedAt` is not null.
- Existing `calledAt` remains unchanged.
- The API response matches the database record.

### NUMBER-001 — Queue Number Uniqueness and Sequential Order
**Test Level:** API Integration Test / Database Integration Test

**Preconditions:**
- Queue Q exists and is `OPEN`.
- No active entries are pending for the same queue during the initial sequence validation.
- The queue-number counter follows the rule documented in `system-sds.md` and `srs.md`.

**Input:**
- Sequential `POST /api/queues/{queueId}/entries` requests for Q from valid customers.

**Execution Steps:**
1. Authenticate as a valid customer.
2. Create a first join request and record the returned `queueNumber`.
3. Create subsequent join requests in sequence.
4. Inspect API responses and query the database for all queue entries in Q.

**Expected HTTP Status:**
- Each successful join returns `201 Created`.

**Expected Response Body:**
- Each successful response contains a positive integer `queueNumber`.
- The returned queue numbers match the sequential order defined by the queue contract.
- No duplicate queue numbers are present within the same queue.

**Expected Database Side Effects:**
- Every joined queue entry in Q has a positive integer `queueNumber`.
- Queue numbers increase in the documented sequence and do not reset during Sprint 1.
- No duplicate `(serviceQueueId, queueNumber)` values exist.

**Pass Criteria:**
- All successful entries have positive integer queue numbers.
- Sequential joins produce the expected sequence.
- No duplicate queue numbers exist within the same queue.
- Database records match the API responses.

### CONCURRENCY-001 — Parallel Queue Join Race Condition
**Test Level:** Database Concurrency / API Integration Test

**Preconditions:**
- Queue Q exists and is `OPEN`.
- Several authenticated customers are prepared to join Q concurrently.
- Database transaction and locking behavior is enabled as described in `system-sds.md`.

**Input:**
- Concurrent `POST /api/queues/{queueId}/entries` requests from multiple customers for the same Q.

**Execution Steps:**
1. Authenticate as multiple valid customers.
2. Trigger concurrent join requests for Q.
3. Wait for all requests to complete.
4. Query the database for rows in Q and inspect `queueNumber` values and active-entry uniqueness.

**Expected HTTP Status:**
- Successful requests return `201 Created`.
- Rejected requests return the documented conflict or validation error for the contract.

**Expected Response Body:**
- Successful responses include unique queue numbers.
- Failed responses follow the standard error envelope.

**Expected Database Side Effects:**
- Successful requests receive unique queue numbers within Q.
- No duplicate `(serviceQueueId, queueNumber)` records exist.
- No inconsistent or partially created active entries remain.
- `lastQueueNumber` remains consistent with the transaction and lock contract.

**Pass Criteria:**
- Successful requests receive unique queue numbers.
- No duplicate `(serviceQueueId, queueNumber)` records exist.
- Queue-number allocation follows the documented transaction and locking strategy.
- Any rejected request returns the documented error response.
- Database state remains consistent after all requests finish.

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

### UI-001 — Responsive Layout at Required Viewport Widths
**Test Level:** End-to-End / Browser UI Test

**Tool:** Playwright

**Preconditions:**
- The application is available in the test environment.
- Test users and required queue data are available.
- The customer and operator pages can be accessed.
- The responsive layout requirements are documented in [ui-spec.md](./ui-spec.md).

**Test Viewports:**
- Mobile: `360 × 800`
- Desktop: `1280 × 800`

**Execution Steps:**
1. Launch the application using Playwright.
2. Set the viewport to `360 × 800`.
3. Open the customer queue catalog at `/customer`.
4. Inspect the available-queues tab and my-active-tickets tab.
5. Open a customer ticket detail page at `/customer/entries/:id`.
6. Sign in as an operator.
7. Open the operator dashboard at `/operator` and a queue detail view at `/operator/queues/:id`.
8. Inspect the mobile layout and action controls.
9. Change the viewport to `1280 × 800`.
10. Repeat the relevant page checks.
11. Inspect horizontal overflow and visibility of interactive elements.

**Expected Result:**

At `360px`:
- Main content uses a single-column layout.
- Queue cards and entry cards remain readable and do not overflow horizontally.
- Primary action buttons remain visible and usable.
- Navigation adapts to the mobile layout.
- No required content is clipped.

At `1280px`:
- Desktop layouts remain readable and no unnecessary horizontal overflow occurs.
- Queue information and operator actions remain readable.
- Tables or multi-column workspaces appear where specified.
- No overlapping or clipped critical UI elements.

**Pass Criteria:**
- All required screens render correctly at both viewport widths.
- `document.documentElement.scrollWidth` does not exceed `window.innerWidth` for layouts that are required to fit the viewport.
- Required buttons and inputs are visible and usable.
- No overlapping or clipped critical UI elements.
- Playwright assertions pass at both viewport sizes.

## 4. Verification conditions

- All state transition tests must validate the lifecycle contract: `WAITING -> CALLED -> SERVING -> COMPLETED`.
- All concurrency tests must exercise real database transactions, not mocked in-memory state.
- All API error codes must match the contract in the SRS, system SDS, and API specification.
- Customer privacy tests must verify that cross-owner reads return `404 RESOURCE_NOT_FOUND` and never reveal other-user data.
- UI tests must validate usability and responsiveness at 360 px and 1280 px without horizontal overflow.

## 5. Coverage summary

This test plan maps to FR-01 through FR-13, BR-01 through BR-12, and NFR-01 through NFR-08 as defined in [../../traceability.md](../../traceability.md). The IDs describe planned verification only; no test is claimed as passed unless the implementation provides evidence from a real execution.

