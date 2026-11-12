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

| ID | Name | Expected result | Level | Status |
|---|---|---|---|---|
| AUTH-001 | Customer login success | valid CUSTOMER session created | API integration | **PASSED** (#3, `tests/auth.test.ts`) |
| AUTH-002 | Operator login success | valid OPERATOR session created | API integration | **PASSED** (#3, `tests/auth.test.ts`) |
| AUTH-003 | Logout revokes session | protected requests fail after logout | API integration | **PASSED** (#3, `tests/auth.test.ts`) |
| AUTH-004 | Invalid credentials | generic `401 UNAUTHORIZED` response | API integration | **PASSED** (#3, `tests/auth.test.ts`) |
| AUTH-005 | Authenticated identity and expired session | `/auth/me` returns identity; expired sessions cannot access protected routes | API integration | **PASSED** (#3, `tests/auth.test.ts`) |
| SEC-001 | Password and secret handling | passwords are salted and never returned to the UI or API; secrets remain absent from logs | Security / API integration | **PASSED** (Verified in `tests/seed.test.ts`, `tests/config.test.ts`) |
| SEC-002 | CSRF enforcement | missing or invalid CSRF tokens are rejected before mutation | Security / API integration | **PASSED** (Verified in `tests/csrf.test.ts`, `tests/queue-registration.test.ts`) |
| QUEUE-001 | OPEN queue listing | only OPEN queues are returned | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| QUEUE-002 | Join queue success | a `WAITING` entry is created with queue number and join timestamp | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| QUEUE-003 | Duplicate active join rejected | second active join returns `409 DUPLICATE_ACTIVE_ENTRY` | Database integration | **PASSED** (Verified in `tests/foundation.test.ts`, `tests/queue-registration.test.ts`) |
| QUEUE-004 | Closed queue rejection | closed queue join returns `409 QUEUE_NOT_AVAILABLE` | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| QUEUE-005 | Rejoin after completion | completed entry may be rejoined later | Database integration | **PASSED** (Verified in `tests/foundation.test.ts`, `tests/queue-registration.test.ts`) |
| QUEUE-006 | Privacy enforcement | customer can access only own entry | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| QUEUE-007 | FIFO operator listing | entries ordered according to FIFO rule | API integration | Pending (#6) |
| QUEUE-008 | Customer joins multiple queues | one active entry per customer per queue is allowed across distinct queues | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| NUMBER-001 | Queue-number uniqueness and sequential order | successful sequential joins receive the next positive number without duplicates within the queue | API integration / Database integration | **PASSED** (Verified in `tests/foundation.test.ts`, `tests/queue-registration.test.ts`) |
| NUMBER-002 | Number allocation rollback | failed transaction does not persist a queue number | Database integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| API-001 | Malformed request rejection | malformed payloads and identifiers return `400 INVALID_ARGUMENT` without mutation | API integration | **PASSED** (Verified in `tests/foundation.test.ts`, `tests/queue-registration.test.ts`) |
| FLOW-001 | Call next selects oldest WAITING | oldest eligible row is moved to `CALLED` | Database integration | Pending (#6) |
| FLOW-002 | Call next successfully transitions WAITING to CALLED | selected WAITING entry changes to `CALLED` and `calledAt` is set | API integration / Database integration | Pending (#6) |
| FLOW-003 | Empty call next | `204 No Content` and no mutation | API integration | Pending (#6) |
| FLOW-004 | Start service successfully transitions CALLED to SERVING | selected called entry changes to `SERVING` and `serviceStartedAt` is set | API integration / Database integration | Pending (#6) |
| FLOW-005 | Invalid lifecycle transition rejection | repeated or out-of-order transitions fail with `409 INVALID_STATE_TRANSITION` | API integration | Pending (#6) |
| FLOW-006 | Complete transition | `SERVING -> COMPLETED` and timestamp set | API integration | Pending (#6) |
| FLOW-007 | Completed terminal guard | repeated completion attempts fail | API integration | Pending (#6) |
| RBAC-001 | Customer cannot call next | `403 FORBIDDEN` | API integration | Pending (#6) |
| RBAC-002 | Customer cannot start | `403 FORBIDDEN` | API integration | Pending (#6) |
| RBAC-003 | Customer cannot complete | `403 FORBIDDEN` | API integration | Pending (#6) |
| RBAC-004 | Operator assignment enforcement | unassigned queue access fails | API integration | Pending (#6) |
| RBAC-005 | Cross-owner entry access denied | customer request to another customer's entry fails | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| CONCURRENCY-001 | Parallel queue join race condition | concurrent join requests preserve unique queue numbers and consistent active entries | Database concurrency / API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| CONCURRENCY-002 | Duplicate active entry race | only one active row survives under concurrent duplicate joins | Database integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| CONCURRENCY-003 | Call-next race | concurrent call-next requests claim different entries correctly | Database integration | Pending (#6) |
| CONCURRENCY-004 | Stale concurrent mutation | stale mutation returns conflict response without corrupting state | Database integration | Pending (#6) |
| PERF-001 | Local performance targets | p95 read and mutation timings meet Sprint 1 local targets | Performance | Pending |
| REL-001 | Commit durability | successful mutation persists after commit and survives restart validation | Database integration | Pending |
| UI-001 | Responsive core workflows | pages remain usable at 360 px and 1280 px without horizontal overflow | Browser E2E | Pending |
| SETUP-001 | Reproducible local setup | clean checkout can provision required test accounts and queues | Manual verification | **PASSED** (Verified in `tests/seed.test.ts` & clean checkout) |
| FLOW-009 | Customer E2E flow | login, join queue, view own detail | E2E | Pending |
| FLOW-010 | Operator E2E flow | login, call, start, complete | E2E | Pending |

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

### NUMBER-002 — Number Allocation Rollback on Transaction Failure
**Test Level:** Database Integration / Transactional Atomicity Test

**Preconditions:**
- Queue Q exists and is `OPEN` with `lastQueueNumber = 0`.
- An entry with `queueNumber = 1` already exists in Q for a different customer while `lastQueueNumber` is left at `0` to force a unique constraint conflict (`QueueEntry_serviceQueueId_queueNumber_key`) when a new customer registers.

**Input:**
- Customer sends `POST /api/queues/{queueId}/entries` with valid credentials and CSRF token.

**Execution Steps:**
1. Authenticate as a customer.
2. Send join-queue request for Queue Q.
3. Observe the atomic execution inside `prisma.$transaction`: `lastQueueNumber` is incremented to `1`, but `queueEntry.create` fails on unique constraint violation.
4. Verify the API response status and error body.
5. Query the database to verify whether `ServiceQueue.lastQueueNumber` rolled back.

**Expected HTTP Status:**
- `500 Internal Server Error` (the unique constraint conflict on `queueNumber` is not a customer duplicate entry and bubbles up as an internal error per discriminator rules).

**Expected Response Body:**
- Error code `INTERNAL_ERROR`.
- Response follows the standard error envelope.

**Expected Database Side Effects:**
- `ServiceQueue.lastQueueNumber` rolls back to its initial value (`0`) atomically.
- No new queue-entry row is persisted for the calling customer.

**Pass Criteria:**
- The transaction rolls back completely; `lastQueueNumber` does not remain at the incremented value, guaranteeing that no counter gaps or leaked numbers occur on mid-transaction failures.

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

This test plan maps to FR-01 through FR-13, BR-01 through BR-12, and NFR-01 through NFR-08 as defined in [../../traceability.md](../../traceability.md).

## 6. Execution Evidence and Automated Test Results (Issue #2 Foundation)

**Execution Date:** 2026-11-12  
**Test Suite:** Vitest v2.1.9 (`npm test --workspace=server`)  
**Target Environment:** Isolated PostgreSQL database (`qms_test_db`) on `127.0.0.1:5433`  
**Overall Result:** **27 passed / 27 total (100% Pass)**

### Test Results Breakdown:

#### 1. Foundation & Database Integration (`tests/foundation.test.ts` - 16 passed)
- `API-001: Path Parameter Validation (UUIDv4)`:
  - `[PASS]` rejects malformed entryId with `400 INVALID_ARGUMENT` (pure error envelope)
  - `[PASS]` rejects malformed queueId with `400 INVALID_ARGUMENT`
  - `[PASS]` accepts valid RFC 4122 UUIDv4 parameters
- `Request Body & Query Validation Middleware (Zod)`:
  - `[PASS]` rejects missing or malformed body fields with `400 INVALID_ARGUMENT`
  - `[PASS]` rejects invalid query parameter enum with `400 INVALID_ARGUMENT`
  - `[PASS]` accepts valid body and query parameters
- `Auth & RBAC Middleware Skeleton`:
  - `[PASS]` returns `401 UNAUTHORIZED` when session user is missing
  - `[PASS]` returns `200 OK` when session user is authenticated
  - `[PASS]` returns `403 FORBIDDEN` when user lacks required role
  - `[PASS]` returns `200 OK` when user matches required role
- `Real PostgreSQL Constraints & DDL Verification`:
  - `[PASS]` migration file exists and contains all required checks, unique keys, and partial indexes
  - `[PASS]` (`QUEUE-003`) enforces partial unique index: duplicate active join in the same queue is rejected by the database
  - `[PASS]` (`QUEUE-005`) permits rejoin after previous entry is `COMPLETED`
  - `[PASS]` enforces CHECK constraint: `ServiceQueue.lastQueueNumber` cannot be negative (`>= 0`)
  - `[PASS]` (`NUMBER-001`) enforces CHECK constraint: `QueueEntry.queueNumber` must be strictly positive (`> 0`)
  - `[PASS]` (`NUMBER-001`) enforces UNIQUE constraint on `(serviceQueueId, queueNumber)`

#### 2. Idempotent Seed Integration (`tests/seed.test.ts` - 2 passed)
- `[PASS]` (`SETUP-001`, `SEC-001`) provisions deterministic RFC 4122 UUIDv4 users, queues, and assignments on first run with salted bcrypt hashes
- `[PASS]` (`BR-04`, `BR-12`) **CRITICAL**: re-running seed does NOT reset `lastQueueNumber` back to 0 and creates no duplicate rows

#### 3. Startup Configuration & Test DB Isolation Guard (`tests/config.test.ts` - 9 passed)
- `[PASS]` uses `TEST_DATABASE_URL` when `NODE_ENV=test`
- `[PASS]` refuses to fall back to `DATABASE_URL` when `TEST_DATABASE_URL` is missing in tests
- `[PASS]` refuses a `TEST_DATABASE_URL` that points at the development database
- `[PASS]` requires `DATABASE_URL` outside tests (no hardcoded default)
- `[PASS]` accepts a complete configuration
- `[PASS]` rejects a missing `SESSION_SECRET`
- `[PASS]` rejects the `.env.example` placeholder secret
- `[PASS]` rejects a short `SESSION_SECRET` (< 32 chars)
- `[PASS]` rejects a missing `DATABASE_URL` and a non-numeric `PORT`

## 7. Execution Evidence and Automated Test Results (Issue #3 Authentication & RBAC)

**Execution Date:** 2026-11-12  
**Server suite:** Vitest v2.1.9 (`npm test`) against the isolated PostgreSQL 16 test database (`qms_test_db`, Docker container)  
**Server result:** **60 passed / 60 total** (27 Issue #2 baseline + 33 new)  
**Client suite:** Vitest v2.1.9 + jsdom + React Testing Library (`npm run test:client`)  
**Client result:** **15 passed / 15 total**  
**Also run:** `npm run migrate:test` (2 migrations, none pending), `npm run typecheck --workspace=server` (exit 0), `npm run build` (server `tsc` and client `tsc && vite build` succeeded)

#### Server: `tests/auth.test.ts` (18 passed)
- `[PASS]` `AUTH-001` / `AUTH-002`: customer and operator login return `200` with `data.user` (`id`, `email`, `role`) and no `passwordHash`; `qms_session` is `HttpOnly; SameSite=Lax; Path=/` (no `Secure` outside production); `qms_csrf` is not `HttpOnly`; one `Session` row whose `tokenHash` is the HMAC of, and not equal to, the cookie value; 8-hour lifetime; `/api/auth/me` returns the same identity
- `[PASS]` `AUTH-001`: email is trimmed and lower-cased before lookup; a new login deletes the session presented with the request
- `[PASS]` `AUTH-003`: logout returns `204` with an empty body, deletes the row, and clears both cookies; the old cookie then gets `401` on `/me`; a second logout gets `401`
- `[PASS]` `AUTH-004`: wrong password, unknown email, and `DISABLED` account return identical `401 UNAUTHORIZED` bodies (ignoring `requestId`) and set no cookie; 7 missing/malformed payloads and malformed JSON return `400 INVALID_ARGUMENT`
- `[PASS]` `AUTH-005`: a session with `expiresAt` in the past gets `401` and is deleted; missing, tampered, and oversized cookies get `401`; the session of a user later set to `DISABLED` gets `401`
- `[PASS]` `SEC-001` (regression): a distinctive password, its stored hash, the session token, and the token HMAC appear in no response body and no captured log line, with the request logger switched on

#### Server: `tests/csrf.test.ts` (6 passed) — `SEC-002` partially verified
- `[PASS]` logout without `X-CSRF-Token` returns `403 FORBIDDEN` and the session stays valid
- `[PASS]` logout with a wrong token or another session's token returns `403`; the correct token returns `204`
- `[PASS]` on a test-only mutation route the handler is not invoked when the token is missing or wrong
- `[PASS]` an anonymous mutation gets `401` (authentication is checked before CSRF)
- `[PASS]` `GET` requests and `POST /api/auth/login` need no token
- Not yet run: the `SEC-002` scenario above uses `POST /api/queues/{queueId}/entries`, which is delivered in Issue #5 and must be re-run there

#### Server: `tests/rbac-middleware.test.ts` (9 passed) — middleware level only
- `[PASS]` unauthenticated `401`; `loadSession` sets `req.user` from a real session; customer on an operator-only route `403`; operator allowed
- `[PASS]` `requireQueueAssignment`: assigned operator passes; unassigned operator `403 FORBIDDEN` (both an unassigned queue and an unassigned operator); unknown queue `404 RESOURCE_NOT_FOUND`; customer `403`
- These do not replace `RBAC-001` to `RBAC-004`, which remain Pending (#6)

#### Server: unchanged Issue #2 suites
- `tests/foundation.test.ts` 16 passed, `tests/seed.test.ts` 2 passed, `tests/config.test.ts` 9 passed

#### Client: `src/test/auth.test.tsx` (15 passed)
- `[PASS]` required-field validation before submit; generic `Invalid email or password.` alert on `401` with no session-expired banner and no server message; submit disabled with `Signing in...` while in flight (second click sends nothing)
- `[PASS]` customer goes to `/customer`, operator to `/operator`; anonymous visitors are sent to `/login`; wrong role is sent to its own home; a signed-in user opening `/login` is sent home
- `[PASS]` a `401 UNAUTHORIZED` from an authenticated request clears state, goes to `/login`, and shows exactly `Session expired. Please sign in again.`; no redirect or repeated requests when already on `/login`; a `403` does not trigger it
- `[PASS]` logout sends `X-CSRF-Token` from the `qms_csrf` cookie and returns to `/login` without the banner; `GET` requests send no CSRF header

#### Manual smoke check
- HTTP through the Vite dev proxy (`npm run dev:server`, `npm run dev:client`): customer and operator login `200` with both cookies, `/api/auth/me` `200`, logout without token `403`, logout with token `204`, wrong password `401`; the server log contained no password, cookie, or hash
- Not performed: the in-browser check (role redirect, reload of `/customer` after logout). No browser automation was available; the same behavior is covered only by the jsdom client tests above

## 8. Execution Evidence and Automated Test Results (Issue #4 Core Queue Generation)

**Execution Date:** 2026-11-12  
**Server suite:** Vitest v2.1.9 (`npm test --workspace=server`) against isolated PostgreSQL test database (`qms_test_db`)  
**Server result:** **85 passed / 85 total (100% Pass)**  
**Typecheck & Build:** `tsc --noEmit && tsc --project tsconfig.test.json --noEmit` (exit 0), `npm run build` (exit 0)

#### Server: `tests/queue-registration.test.ts` (25 passed)
- `[PASS]` (`QUEUE-001`) `GET /api/queues`: returns only `OPEN` queues sorted by `createdAt ASC` for authenticated users; rejects unauthenticated with `401 UNAUTHORIZED`
- `[PASS]` (`QUEUE-002`, `NUMBER-001`) `POST /api/queues/:queueId/entries`: successfully joins an OPEN queue and allocates monotonic positive queue numbers starting at 1
- `[PASS]` (`QUEUE-004`) rejects join request for `CLOSED` queue with `409 QUEUE_NOT_AVAILABLE`
- `[PASS]` returns `404 RESOURCE_NOT_FOUND` when joining a non-existent queue
- `[PASS]` returns `400 INVALID_ARGUMENT` when `:queueId` is not a valid UUIDv4
- `[PASS]` (`NUMBER-002`) atomic rollback: when `queueEntry.create` fails on a unique constraint violation after `lastQueueNumber` was updated, the transaction rolls back `lastQueueNumber` cleanly to its initial value (0) and returns `500 INTERNAL_ERROR`
- `[PASS]` (`RBAC-001`) rejects operator role from joining a queue with `403 FORBIDDEN`
- `[PASS]` (`SEC-002`) rejects join request with missing `X-CSRF-Token` with `403 FORBIDDEN`
- `[PASS]` returns `401 UNAUTHORIZED` for unauthenticated join requests
- `[PASS]` (`QUEUE-003`) duplicate active join rejection: second active join returns `409 DUPLICATE_ACTIVE_ENTRY` without incrementing `lastQueueNumber`
- `[PASS]` rejects duplicate join when customer already has an entry in `CALLED` or `SERVING` status (`409 DUPLICATE_ACTIVE_ENTRY`)
- `[PASS]` (`QUEUE-005`) permits rejoin after previous entry is `COMPLETED` and allocates next monotonic queue number
- `[PASS]` (`QUEUE-008`) permits a customer to hold active entries across distinct queues simultaneously
- `[PASS]` (`CONCURRENCY-001`) parallel join requests from 8 concurrent customers produce strictly contiguous unique queue numbers (1..8) without duplicates, gaps, or lost updates
- `[PASS]` (`CONCURRENCY-002`) concurrent duplicate join requests by the same customer: exactly 1 succeeds (201) and the rest fail with `409 DUPLICATE_ACTIVE_ENTRY`
- `[PASS]` `GET /api/me/queue-entries`: lists customer entries in `joinedAt DESC` order including completed history
- `[PASS]` `GET /api/me/queue-entries`: orders entries with identical `joinedAt` deterministically by `id DESC`
- `[PASS]` `GET /api/me/queue-entries/:entryId`: calculates deterministic FIFO `aheadCount` accurately for `WAITING` entries
- `[PASS]` `GET /api/me/queue-entries/:entryId`: returns `aheadCount: 0` for all non-WAITING statuses (`CALLED`, `SERVING`, `COMPLETED`)
- `[PASS]` `GET /api/me/queue-entries/:entryId`: enforces tie-breaker `id ASC` ordering when `joinedAt` timestamps are identical
- `[PASS]` (`RBAC-005`, `QUEUE-006`) cross-owner entry lookup is masked as `404 RESOURCE_NOT_FOUND`
- `[PASS]` returns `400 INVALID_ARGUMENT` when `:entryId` is malformed
- `[PASS]` rejects operator role on `/api/me/queue-entries` with `403 FORBIDDEN`
