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
| SEC-002 | CSRF enforcement | missing or invalid CSRF tokens are rejected before mutation | Security / API integration | **PASSED** (#5, `tests/join-csrf.test.ts`; #6, `tests/operator-workflow.test.ts`; logout covered in `tests/csrf.test.ts`) |
| QUEUE-001 | OPEN queue listing | only OPEN queues are returned | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| QUEUE-002 | Join queue success | a `WAITING` entry is created with queue number and join timestamp | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| QUEUE-003 | Duplicate active join rejected | second active join returns `409 DUPLICATE_ACTIVE_ENTRY` | Database integration | **PASSED** (Verified in `tests/foundation.test.ts`, `tests/queue-registration.test.ts`) |
| QUEUE-004 | Closed queue rejection | closed queue join returns `409 QUEUE_NOT_AVAILABLE` | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| QUEUE-005 | Rejoin after completion | completed entry may be rejoined later | Database integration | **PASSED** (Verified in `tests/foundation.test.ts`, `tests/queue-registration.test.ts`) |
| QUEUE-006 | Privacy enforcement | customer can access only own entry | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| QUEUE-007 | FIFO operator listing | entries ordered according to FIFO rule | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| QUEUE-008 | Customer joins multiple queues | one active entry per customer per queue is allowed across distinct queues | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| NUMBER-001 | Queue-number uniqueness and sequential order | successful sequential joins receive the next positive number without duplicates within the queue | API integration / Database integration | **PASSED** (Verified in `tests/foundation.test.ts`, `tests/queue-registration.test.ts`) |
| NUMBER-002 | Number allocation rollback | failed transaction does not persist a queue number | Database integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| API-001 | Malformed request rejection | malformed payloads and identifiers return `400 INVALID_ARGUMENT` without mutation | API integration | **PASSED** (Verified in `tests/foundation.test.ts`, `tests/queue-registration.test.ts`, `tests/operator-workflow.test.ts`) |
| FLOW-001 | Call next selects oldest WAITING | oldest eligible row is moved to `CALLED` | Database integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| FLOW-002 | Call next successfully transitions WAITING to CALLED | selected WAITING entry changes to `CALLED` and `calledAt` is set | API integration / Database integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| FLOW-003 | Empty call next | `204 No Content` and no mutation | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| FLOW-004 | Start service successfully transitions CALLED to SERVING | selected called entry changes to `SERVING` and `serviceStartedAt` is set | API integration / Database integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| FLOW-005 | Invalid lifecycle transition rejection | repeated or out-of-order transitions fail with `409 INVALID_STATE_TRANSITION` | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| FLOW-006 | Complete transition | `SERVING -> COMPLETED` and timestamp set | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| FLOW-007 | Completed terminal guard | repeated completion attempts fail | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| RBAC-001 | Customer cannot call next | `403 FORBIDDEN` | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| RBAC-002 | Customer cannot start | `403 FORBIDDEN` | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| RBAC-003 | Customer cannot complete | `403 FORBIDDEN` | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| RBAC-004 | Operator assignment enforcement | unassigned queue access fails | API integration | **PASSED** (#6, `tests/operator-workflow.test.ts`, `tests/rbac-middleware.test.ts`) |
| RBAC-005 | Cross-owner entry access denied | customer request to another customer's entry fails | API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| CONCURRENCY-001 | Parallel queue join race condition | concurrent join requests preserve unique queue numbers and consistent active entries | Database concurrency / API integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| CONCURRENCY-002 | Duplicate active entry race | only one active row survives under concurrent duplicate joins | Database integration | **PASSED** (#4, `tests/queue-registration.test.ts`) |
| CONCURRENCY-003 | Call-next race | concurrent call-next requests claim different entries correctly | Database integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| CONCURRENCY-004 | Stale concurrent mutation | stale mutation returns conflict response without corrupting state | Database integration | **PASSED** (#6, `tests/operator-workflow.test.ts`) |
| PERF-001 | Local performance targets | p95 read and mutation timings meet Sprint 1 local targets | Performance | Pending — not run in #7: no 1,000-entry dataset and no 100-request p95 measurement were executed (see §13) |
| REL-001 | Commit durability | successful mutation persists after commit and survives restart validation | Database integration | Pending — not run in #7: no application/database restart check was executed (see §13) |
| UI-001 | Responsive core workflows | pages remain usable at 360 px and 1280 px without horizontal overflow | Browser E2E | **PASSED** (#7, Playwright Chromium, `e2e/tests/responsive.spec.ts`: all six customer and operator screens at 360 × 800 and 1280 × 800, two consecutive runs; see §13) |
| SETUP-001 | Reproducible local setup | clean checkout can provision required test accounts and queues | Manual verification | **PASSED** (Verified in `tests/seed.test.ts` & clean checkout) |
| FLOW-009 | Customer E2E flow | login, join queue, view own detail | E2E | **PASSED** (#7, Playwright Chromium, `e2e/tests/customer-flow.spec.ts` S1 and S5; see §13) |
| FLOW-010 | Operator E2E flow | login, call, start, complete | E2E | **PASSED** (#7, Playwright Chromium, `e2e/tests/operator-flow.spec.ts` S4, plus S5 from the customer side; see §13) |

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

## 9. Execution Evidence and Automated Test Results (Issue #5 Customer Queue Workflow)

**Execution Date:** 2026-11-13
**Server suite:** Vitest v2.1.9 (`npm test`) against the isolated PostgreSQL 16 test database (`qms_test_db`, Docker container on `127.0.0.1:5433`)
**Server result:** **91 passed / 91 total** (85 Issue #4 baseline + 6 new)
**Client suite:** Vitest v2.1.9 + jsdom + React Testing Library (`npm run test:client`)
**Client result:** **58 passed / 58 total** (15 Issue #3 baseline + 43 new)
**Also run:** `npm run migrate:test` (2 migrations, none pending), `npm run typecheck --workspace=server` (exit 0), `npm run build` (server `tsc` and client `tsc && vite build`, exit 0)

#### Server: `tests/join-csrf.test.ts` (6 passed) — `SEC-002` on the join endpoint
- `[PASS]` `POST /api/queues/{queueId}/entries` with no `X-CSRF-Token`, an empty token, a wrong token, and another user's session token each return `403 FORBIDDEN` in the standard envelope; in each case no `QueueEntry` row is created and `ServiceQueue.lastQueueNumber` is unchanged
- `[PASS]` the caller's own token returns `201`, creates exactly one `WAITING` entry, and allocates `lastQueueNumber + 1`
- `[PASS]` rejected attempts do not consume a number: the next valid join still receives the next number
- No server code change was needed
- `QUEUE-006` and `RBAC-005` were not duplicated; they were re-run in `tests/queue-registration.test.ts` and passed

#### Client: `src/test/customer.test.tsx` (26 passed)
- `[PASS]` Available Queues: names, descriptions, and the text availability label; loading, neutral empty ("No queues are open right now."), and error-with-retry states; no server text shown
- `[PASS]` Join: success panel with queue name, number, and `Waiting`; `X-CSRF-Token` taken from the `qms_csrf` cookie and no body; both lists re-fetched; `Joining queue...` with the clicked button disabled and other queues enabled; a double click (including two clicks before re-render) sends exactly one `POST`; each mapped error (`DUPLICATE_ACTIVE_ENTRY`, `QUEUE_NOT_AVAILABLE`, `RESOURCE_NOT_FOUND`, `FORBIDDEN`, other, network failure) shows its safe text with buttons enabled and the queue list re-fetched where required; a `401` uses the session-expired redirect
- `[PASS]` My Active Tickets: entries with the mapped queue name and the `Service queue` fallback, icon plus text status, lifecycle timestamps in `<time dateTime>`, no `aheadCount`, links to `/customer/entries/:id`, no per-item detail calls; empty, error-with-retry, and Refresh
- `[PASS]` Polling (fake timers): every 10 s only while the tickets tab is shown and the page is visible; stops on unmount; a status change is announced in the polite live region; a failed poll keeps the data and shows "Could not refresh. Retrying..."
- `[PASS]` Tabs are keyboard operable (Left/Right with wrap-around, roving focus); live region and accessible control names exist
- `[PASS]` Access: anonymous visitors to `/customer` and `/customer/entries/:id` go to `/login`; an operator is redirected to `/operator` without any customer API call

#### Client: `src/test/entryDetail.test.tsx` (17 passed)
- `[PASS]` number, queue name (with fallback), status, joined and other set timestamps, back link
- `[PASS]` messages: "You are next", "1 person ahead", "N people ahead", and the `CALLED` / `SERVING` / `COMPLETED` texts; no ahead line outside `WAITING`
- `[PASS]` `QUEUE-006` / `RBAC-005` at UI level: a `404` and a `400` show only "We couldn't find that queue entry." with no entry data or server text
- `[PASS]` polling every 10 s, skipped while hidden, stopped at `COMPLETED` (and never started for a completed entry), stopped on unmount; status change announced; failed poll keeps data and recovers; a `401` during polling triggers the session-expired redirect and banner

#### Manual smoke check (HTTP through the Vite dev proxy, development database)
- `customer1` login `200`; `GET /api/queues` `200` with only "General Inquiry Desk"; join without or with a wrong token `403 FORBIDDEN`; join with the token `201` (`WAITING`, number 1); join again `409 DUPLICATE_ACTIVE_ENTRY`; closed queue `409 QUEUE_NOT_AVAILABLE`; `GET /api/me/queue-entries` `200` without `aheadCount`; own detail `200` with `aheadCount: 0`; malformed id `400`; `customer2` reading that entry `404` with no data; operator on `/api/me/queue-entries` `403`; anonymous `401`; `/customer/entries/:id` served by Vite `200`. No cookie or token values were printed
- Browser verification was not completed during the initial attempt; see §10. The later browser run in §11 verified the customer screens: UI-001 is PASSED for customer screens; operator screens remain Pending (#6). The live-region announcement was checked through Chromium's accessibility tree, not with spoken output from a screen reader; testing on a physical touch device was also not performed.

## 10. UI-001 Browser Verification Attempt (Initial Attempt — Superseded by §11)

**Execution Date:** 2026-11-13  
**Result:** **BLOCKED — this initial attempt was superseded by the customer-screen verification in §11**

- The Vite client started at `http://localhost:5173/`.
- The API development server did not start: Node.js 22.20.0 / tsx exited with `uv_os_get_passwd returned ENOMEM` before serving requests.
- Browser inspection could not proceed: the available browser-control session reported that it could not determine the current Brave URL with enough confidence and stopped. A browser access host was also unavailable in the initial browser inventory.
- No viewport measurements, keyboard-only run, live screen-reader announcement, or touch-target measurements were obtained. Do not treat the existing component tests or source markup as substitutes for these browser checks.
- This initial attempt did not complete the browser checks. The later results are recorded in §11: customer screens passed; operator screens remain Pending for Issue #6.

## 11. UI-001 Browser Verification (Customer Screens, Issue #5)

**Execution Date:** 2026-11-13  
**Result:** **PASSED for the customer screens.** The operator screens (`/operator`, `/operator/queues/:id`; UI-001 steps 6–7) do not exist yet, so that part of UI-001 stays **Pending (#6)**. Section 10's blockers were worked around as described below.

**Environment**
- API: `npm run build:server`, then `node dist/server.js` (port 3000). Running the compiled output avoids the `tsx` `uv_os_get_passwd ENOMEM` failure from section 10.
- Database: the `qms-postgres` development container (port 5433) had stopped and was started with `docker start qms-postgres`. No migration, seed, or manual SQL was run.
- Client: Vite dev server at `http://localhost:5173` (proxy to `:3000`).
- Browser: headless Chromium 153.0.8010.12 (the local Playwright `chromium-1243` build), driven by a throwaway `playwright-core` 1.49.1 script outside the repository. Account: `customer2@example.com`, which had no active entry before the run.
- Side effect on the development database: one real join. `customer2` received queue number 2 in "General Inquiry Desk" (`WAITING`).

**1. Viewports, 360 × 800 and 1280 × 800: [PASS]**

| Screen | 360 px `scrollWidth` / `innerWidth` | 1280 px `scrollWidth` / `innerWidth` | Elements extending past the right edge |
|---|---|---|---|
| `/login` | 360 / 360 | 1280 / 1280 | none |
| `/customer`, Available Queues tab | 360 / 360 | 1280 / 1280 | none |
| `/customer`, My Active Tickets tab | 360 / 360 | 1280 / 1280 | none |
| `/customer/entries/:id` | 360 / 360 | 1280 / 1280 | none |

- On every screen, `document.documentElement.scrollWidth` ≤ `window.innerWidth`, and no element's bounding box crosses the viewport edge.
- Full-page screenshots were reviewed. At 360 px the layout is a single column, Logout and Join Queue are full width, and the two tabs split the row. At 1280 px the content is centered and the detail card shows the number, status, and message side by side. No clipped or overlapping content was seen.

**2. Keyboard-only flow (360 px): [PASS], with one finding**
- Tab order on `/customer`: Logout → "Available Queues" tab → tab panel → "Join queue: General Inquiry Desk". Every focused element matched `:focus-visible` and showed a visible ring.
- Tabs: ArrowRight moves to "My Active Tickets" and shows its panel. ArrowRight again wraps back to "Available Queues". End and Home select the last and first tab. Inactive tabs have `tabindex=-1` (roving focus). Enter on a focused tab activates it.
- Pressing Enter on Join Queue created the entry. The `role="status"` confirmation read "You joined General Inquiry Desk … Queue number 2 … Waiting".
- From there, the keyboard reached "View details", and Enter opened `/customer/entries/:id`. That page showed queue number 2 and the message "Currently waiting. 1 person ahead of you."
- Tab order on the detail page: "Back to my queues" → Refresh. Enter on the back link returned to `/customer`. The ticket's link has the accessible name "View details for queue number 2 in General Inquiry Desk".
- **Finding (not blocking):** after Join succeeds, focus falls back to `<body>`. The Join button becomes disabled while the request is pending, and focus is not restored afterwards. Keyboard users have to Tab or Shift+Tab again to reach "View details". A screen reader still hears the confirmation through `role="status"`. ui-spec §8 only requires visible focus, so this does not fail UI-001. A follow-up could move focus to the confirmation or to its "View details" link.

**3. Screen-reader announcement of a status change: [PASS] (verified through the accessibility tree, not with a real screen reader)**
- The operator lifecycle endpoints are not implemented yet (#6). To simulate a status change, the browser intercepted `GET /api/me/queue-entries/:id` and changed the real response from `WAITING` to `CALLED`. The database was not changed. The Refresh button was then pressed.
- The live region (`aria-live="polite"`, `aria-atomic="true"`, `sr-only`) was empty on load. It then contained: "Queue number 2 in General Inquiry Desk is now Called. Please go to the service desk." The visible message changed to "Please go to the service desk."
- Chromium's accessibility tree (CDP `Accessibility.getFullAXTree`) exposes this node with `live=polite`, `atomic=true`, `relevant=additions text`. These are the properties a screen reader uses to announce the change.
- **Not performed:** a listening test with NVDA, JAWS, VoiceOver, or TalkBack. A spoken-output check is still recommended once #6 provides real status changes.

**4. Touch-target size (360 px viewport, `hasTouch`): [PASS]**
- Every visible interactive element measured **44 px high or more**. Widths: Logout 328, tabs 164 each, Join Queue 294, Refresh 328 (on the tickets tab) or 294 (on the detail page), ticket "View details" 294, "Back to my queues" 155, login inputs and Sign in 278.
- At 1280 px the heights are also 44 px. The smallest width is 86 px (Logout).
- This meets WCAG 2.5.5 (44 × 44 CSS px) and therefore 2.5.8 (24 × 24).
- Not performed: testing on a physical touch device.

## 12. Execution Evidence and Automated Test Results (Issue #6 Operator Queue Management Workflow)

**Execution Date:** 2026-11-13  
**Server suite:** Vitest v2.1.9 (`npm test`) against the isolated PostgreSQL 16 test database (`qms_test_db` on `localhost:5432`)  
**Server result:** **109 passed / 109 total (100% Pass across 9 test files)** (91 Issue #5 baseline + 18 new Issue #6 operator tests)  
**Client suite:** Vitest v2.1.9 + jsdom + React Testing Library (`npm run test:client`)  
**Client result:** **71 passed / 71 total (100% Pass across 4 test files)** (58 Issue #5 baseline + 13 new Issue #6 operator UI tests)  
**Typecheck & Build:** `npm run typecheck --workspace=server` (exit 0), `npm run build` (server `tsc` and client `tsc && vite build`, exit 0)

#### Server: `tests/operator-workflow.test.ts` (18 passed)
- `[PASS]` `GET /api/operator/queues`: returns only service queues assigned to the authenticated operator via `OperatorAssignment` (`operator1` receives assigned queue; `operator2` receives `[]`)
- `[PASS]` `GET /api/operator/queues`: includes `CLOSED` queues when assigned to the operator (allowing operators to finish active entries in a closed queue)
- `[PASS]` `GET /api/operator/queues`: rejects `CUSTOMER` role with `403 FORBIDDEN` and anonymous callers with `401 UNAUTHORIZED`
- `[PASS]` (`QUEUE-007`) `GET /api/operator/queues/:queueId/entries`: returns all queue entries for an assigned queue ordered deterministically by FIFO (`joinedAt ASC, id ASC`), verifying tie-breaker `id ASC` when `joinedAt` timestamps are equal
- `[PASS]` (`API-001`) `GET /api/operator/queues/:queueId/entries`: returns `404 RESOURCE_NOT_FOUND` for a non-existent queue and `400 INVALID_ARGUMENT` for a malformed `:queueId` UUID
- `[PASS]` (`FLOW-001`, `FLOW-002`) `POST /api/operator/queues/:queueId/call-next`: selects the oldest eligible `WAITING` entry in strict FIFO order (`joinedAt ASC, id ASC`), transitions its status to `CALLED`, sets `calledAt`, and leaves later `WAITING` entries unchanged
- `[PASS]` (`FLOW-003`) `POST /api/operator/queues/:queueId/call-next`: returns `204 No Content` with an empty response body and performs no database mutation when the queue has no `WAITING` entries (empty queue or only `CALLED` entries)
- `[PASS]` (`FLOW-004`, `FLOW-006`) Full operator lifecycle `WAITING -> CALLED -> SERVING -> COMPLETED`: `POST /api/operator/queue-entries/:entryId/start` transitions `CALLED -> SERVING` and sets `serviceStartedAt`; `POST /api/operator/queue-entries/:entryId/complete` transitions `SERVING -> COMPLETED` and sets `completedAt`, with persisted database state matching API responses
- `[PASS]` (`FLOW-005`, `FLOW-007`) Invalid and out-of-order lifecycle transitions: rejects `WAITING -> SERVING`, `WAITING -> COMPLETED`, `CALLED -> COMPLETED`, duplicate `SERVING -> SERVING`, `COMPLETED -> SERVING`, and repeated `COMPLETED -> COMPLETED` with `409 INVALID_STATE_TRANSITION` without mutating status or timestamps
- `[PASS]` (`API-001`) Returns `404 RESOURCE_NOT_FOUND` for unknown `:entryId` and `400 INVALID_ARGUMENT` for malformed `:entryId` on both `/start` and `/complete`
- `[PASS]` (`API-001`) `POST /api/operator/queues/:queueId/call-next`: returns `404 RESOURCE_NOT_FOUND` for a non-existent valid UUIDv4 `:queueId` and `400 INVALID_ARGUMENT` for a malformed `:queueId`, leaving existing queue entries and database state completely unchanged
- `[PASS]` (`RBAC-001`) Customer cannot call next on any queue (`403 FORBIDDEN`, entry remains `WAITING`)
- `[PASS]` (`RBAC-002`) Customer cannot start service (`403 FORBIDDEN`, entry remains `CALLED`)
- `[PASS]` (`RBAC-003`) Customer cannot complete service (`403 FORBIDDEN`, entry remains `SERVING`)
- `[PASS]` (`RBAC-004`) Operator cannot list entries, call next, start service, or complete service on an unassigned queue (`403 FORBIDDEN` across all four endpoints with zero state mutation)
- `[PASS]` (`SEC-002`) Rejects `call-next`, `start`, and `complete` mutations without a valid `X-CSRF-Token` with `403 FORBIDDEN` before any state change
- `[PASS]` (`CONCURRENCY-003`) Concurrent `call-next` race condition: 6 parallel `call-next` requests across `operator1` and `operator2` against 4 `WAITING` entries result in four `200 OK` responses claiming distinct entries (`queueNumber` 1..4) and two `204 No Content` responses (`FOR UPDATE SKIP LOCKED`)
- `[PASS]` (`CONCURRENCY-004`) Concurrent `start` and `complete` race condition: 5 parallel `/start` requests on a `CALLED` entry result in exactly one `200 OK` and four `409 INVALID_STATE_TRANSITION`; 5 parallel `/complete` requests on that `SERVING` entry result in exactly one `200 OK` and four `409 INVALID_STATE_TRANSITION`

#### Client: `src/test/operator.test.tsx` (13 passed)
- `[PASS]` `/operator` (`OperatorHomePage`): displays assigned `OPEN` and `CLOSED` queues with availability badges (`Open`, `Closed`) and navigates to `/operator/queues/:id`
- `[PASS]` `/operator`: shows neutral empty state (`"You have no assigned service queues."`) when the operator has no assigned queues
- `[PASS]` `/operator`: shows safe error note and retries when loading assigned queues fails (`Try again`)
- `[PASS]` `/operator/queues/:id` (`OperatorQueueDetailPage`): groups entries into `Active Service` (`CALLED` / `SERVING`), `Waiting Queue (FIFO)` (`WAITING`), and `Completed` (`COMPLETED`) with proper button states (`Start Service` enabled and `Complete Service` disabled for `CALLED`; `Start Service` disabled and `Complete Service` enabled for `SERVING`)
- `[PASS]` `/operator/queues/:id`: executes `Call Next` (`WAITING -> CALLED`), `Start Service` (`CALLED -> SERVING`), and `Complete Service` (`SERVING -> COMPLETED`) lifecycle end-to-end with `X-CSRF-Token` header and UI refresh after each transition
- `[PASS]` (`FLOW-003`) `/operator/queues/:id`: shows neutral empty status (`"No waiting entries to call right now."`) when `Call Next` returns `204 No Content`
- `[PASS]` `/operator/queues/:id`: disables `Call Next` with `"Calling next..."` while in flight and prevents duplicate submissions (in-flight duplicate-click guard)
- `[PASS]` (`FLOW-005`) `/operator/queues/:id`: handles `409 INVALID_STATE_TRANSITION` on stale operator actions by showing a safe conflict alert and automatically refreshing the queue entries
- `[PASS]` (`RBAC-004`) `/operator/queues/:id`: shows `403 FORBIDDEN` message (`"You do not have permission to manage this queue."`) when the operator opens an unassigned queue
- `[PASS]` `/operator/queues/:id`: shows not-found message (`"We couldn't find that service queue."`) when the queue does not exist (`404`) or `:id` is malformed (`400`)
- `[PASS]` `/operator/queues/:id`: distinguishes `403` CSRF verification failures (`"We couldn't verify this request. Please refresh the page or sign in again."`) from `403` RBAC permission errors (`"You do not have permission to perform this action."`) on operator actions
- `[PASS]` `/operator/queues/:id`: distinguishes `404` queue-not-found on `Call Next` (`"We couldn't find that service queue."`) from `404` entry-not-found on `Start Service` (`"We couldn't find that queue entry."`)
- `[PASS]` `/operator/queues/:id`: redirects a `CUSTOMER` attempting to open `/operator/queues/:id` to `/customer` without calling operator endpoints

## 13. Execution Evidence and Automated Test Results (Issue #7 Integration, Authorization & E2E)

**Execution Date:** 2026-11-14
**Branch:** `feature/sprint1/7-integration-testing` (from `sprint1-staging` at `68d818f`)
**Environment:** Windows 11 Home (10.0.26200), Node v22.20.0, PostgreSQL 16.15 (`qms-postgres` Docker container on `127.0.0.1:5433`, test database `qms_test_db`), Playwright 1.63.0 with Chrome for Testing 153.0.8010.12 (headless Chromium)
**Coverage / gap analysis:** [`evidence/issue7-coverage.md`](./evidence/issue7-coverage.md). **Screenshots:** [`evidence/README.md`](./evidence/README.md)

### 13.1 Commands and results

Every number below comes from a command run in this session. Step 0 is the regression baseline measured before any Issue #7 change. The Final column is the run after all Issue #7 commits, in this order.

| Command | Step 0 baseline | Final |
|---|---|---|
| `npm run migrate:test` | exit 0 (2 migrations, none pending)¹ | exit 0 (none pending) |
| `npm run typecheck --workspace=server` | exit 0 | exit 0 |
| `npm run test:server` | **109 passed / 0 failed / 0 skipped** (9 files) | **118 passed / 0 failed / 0 skipped** (10 files: 109 + 9 new) |
| `npm run test:client` | **71 passed / 0 failed / 0 skipped** (4 files) | **77 passed / 0 failed / 0 skipped** (5 files: 71 + 6 new) |
| `npm run build` | exit 0 | exit 0 |
| `npm run test:e2e` run 1 | — (no E2E existed) | **10 passed / 0 failed / 0 skipped / 0 flaky**, 130.5 s |
| `npm run test:e2e` run 2 (immediately after run 1) | — | **10 passed / 0 failed / 0 skipped / 0 flaky**, 130.0 s |

¹ The first Step 0 attempt failed because the `qms-postgres` container was not running (`P1001`). It passed after Docker Desktop was started. `npm ci` also removed the generated Prisma client, so `npm run prisma:generate` was run before the baseline server suite. Both are environment steps; no code changed.

E2E settings: `workers: 1`, `fullyParallel: false`, `retries: 0`. Global setup refuses any database whose name does not contain `test` as a word, or that equals `DATABASE_URL`. This refusal was checked against fake configurations in a scratch directory: a `qms_db` target, a target equal to `DATABASE_URL`, a `contest` target, and a missing variable were all refused; `qms_test_db` was accepted. Global setup then runs `migrate:test` and a reset plus seed. Every spec also resets and re-seeds in `beforeEach`. The API runs compiled (`node dist/server.js`) with `NODE_ENV=test`. The browser talks only to the Vite dev server on `:5173`, with `/api` proxied, so cookies and CSRF behave as in normal use; CORS is off. Already-running servers are never reused. Run summaries are in [`evidence/e2e-run.txt`](./evidence/e2e-run.txt).

### 13.2 Server: `tests/integration-sprint1.test.ts` (9 passed)

Real HTTP through supertest, real session cookies and CSRF tokens, real PostgreSQL, no mocked Prisma. Every rejection is checked for the exact status and code and for the envelope `{error:{code,message,requestId}}` with a UUID `requestId` and no `data`. A DB snapshot is compared before and after: all entries with their statuses and timestamps, every `lastQueueNumber`, and the user and assignment counts.
- `[PASS]` (`NFR-02`, `AUTH-003`, `AUTH-005`) All 11 protected endpoints × {anonymous, anonymous with a forged CSRF header, expired session, tampered session cookie, logged-out session reused} → `401 UNAUTHORIZED` (55 requests). No customer id or entry id appears in any body, and the DB is unchanged.
- `[PASS]` (`RBAC-001`–`RBAC-005`, `QUEUE-006`) A 22-row role/assignment table:
  - Operators on customer endpoints → `403`.
  - Customers calling `call-next`/`start`/`complete` and operator reads directly → `403`.
  - Unassigned operator2 on operator1's queue (list, call-next, start, complete) → `403`.
  - operator1 on the unassigned CLOSED queue → `403`.
  - Cross-owner entry reads in both directions → `404 RESOURCE_NOT_FOUND`, not `403`.
  - DB unchanged. Allowed reads return only the caller's own or assigned data.
- `[PASS]` The assigned operator succeeds on each of the three mutations that were rejected for everyone else.
- `[PASS]` A logged-out session is dead for reads, joins and a second logout. Other users' sessions are unaffected.
- `[PASS]` (`SEC-002`) 6 mutations (join OPEN, join CLOSED, call-next, start, complete, logout) × {missing, empty, wrong, another session's token} → `403 FORBIDDEN`. DB, counters and the session count are all unchanged.
- `[PASS]` (FLOW-009/010 at API level) One lifecycle driven only by API calls:
  - Joins get numbers 1 and 2. A duplicate gets `409 DUPLICATE_ACTIVE_ENTRY` and the counter stays at 2. A closed-queue join gets `409 QUEUE_NOT_AVAILABLE`, with no row and the counter at 0.
  - The operator's list is in FIFO order. `aheadCount` goes 1 → 0.
  - start/complete on WAITING, complete on CALLED, start on SERVING, and start/complete on COMPLETED all return `409 INVALID_STATE_TRANSITION` with no DB change.
  - The duplicate join is still rejected while the entry is CALLED or SERVING.
  - The timestamps `joinedAt ≤ calledAt ≤ serviceStartedAt ≤ completedAt` are all RFC 3339 `Z`.
  - Rejoin after COMPLETED gets number 3. FIFO then calls customer2 before customer1's new entry. The final empty `call-next` returns `204` with an empty body and no mutation.
- `[PASS]` (`NFR-03`) 10 joins racing 12 `call-next` requests from two assigned operators:
  - Joins get 201 with numbers 1..10, and `lastQueueNumber` is 10.
  - No entry is claimed twice, and the CALLED rows match the 200 responses exactly.
  - The remaining WAITING entries are called in FIFO order.
- `[PASS]` (`NFR-03`) 4 customers × 4 parallel duplicate joins → exactly one `201` each and the rest `409`. Numbers are 1..4 and the counter is 4.
- `[PASS]` (`NFR-03`) 24 parallel start/complete requests over 4 CALLED entries from two operators. Exactly one start succeeds per entry and at most one complete. Every other request is `409`; none is `500`. Each final status matches the responses.
- After every mutating scenario, SQL invariant checks returned no violations:
  - no two active entries for one (customer, queue)
  - no duplicate `(serviceQueueId, queueNumber)`
  - no status/timestamp combination outside the lifecycle (for example SERVING without `serviceStartedAt`)
  - no out-of-order timestamps
  - no `lastQueueNumber` below an allocated number

The database has no CHECK constraint on lifecycle timestamps, so these SQL checks are the only automated guard for that rule.

### 13.3 Client: `src/test/integration-guards.test.tsx` (6 passed)

- `[PASS]` (ui-spec §7) Session expiry on operator screens: a `401` while loading `/operator/queues/:id`, on Call Next, and on the `/operator` load each clears the user, goes to `/login`, and shows exactly `Session expired. Please sign in again.`. No action error alert and no server text are shown.
- `[PASS]` An operator opening `/customer/entries/:id` is sent to `/operator` with no customer API call.
- `[PASS]` Anonymous visitors to `/operator/queues/:id` and `/customer/entries/:id` go to `/login` without the banner. The only request is the `/api/auth/me` probe.
- The existing client suites were not modified.

### 13.4 Browser E2E (Playwright, Chromium), 10 passed in each of two consecutive runs

| # | Test | Result | What it proves |
|---|---|---|---|
| S1 | `customer-flow.spec.ts` › FLOW-009 | **PASS** ×2 | Login through the form; Available Queues shows only "General Inquiry Desk"; Join → "You joined General Inquiry Desk.", number 1, Waiting; DB has one WAITING row. Detail page shows number 1, the queue name, Waiting, "You are next", and `Joined:` with `<time datetime>` equal to the DB `joinedAt`. |
| S2 | `customer-flow.spec.ts` › duplicate | **PASS** ×2 | Second Join → HTTP 409 → "You already have an active entry in this queue."; button stays enabled; DB still has 1 row and `lastQueueNumber` 1; My Active Tickets shows 1 ticket |
| S3 | `operator-flow.spec.ts` › queue view | **PASS** ×2 | operator1 sees only the assigned queue; the waiting list is FIFO (customer1 at position 1, customer2 at position 2). operator2 sees "You have no assigned service queues." and on the queue URL gets "You do not have permission to manage this queue." with no Call Next button and no customer data. |
| S4 | `operator-flow.spec.ts` › FLOW-010 | **PASS** ×2 | Call Next → Called (Start enabled, Complete disabled) → Start Service → In service → Complete Service → Completed. The feedback banner and sections update after each step. An empty Call Next shows the neutral message. The DB row is COMPLETED with ordered timestamps. |
| S5 | `customer-flow.spec.ts` › customer sees operator changes | **PASS** ×2 | The operator acts in a second browser context. The customer's open detail page changes to Called, then In service, then Completed, with the matching messages and live-region text. This comes from the **real 10 s polling** (`usePolling`); no reload or navigation happened, which was asserted. It takes about 34 s. |
| S6 | `authorization.spec.ts` › role separation | **PASS** ×2 | A customer opening `/operator` and `/operator/queues/:id` ends on `/customer`, with zero `/api/operator/*` requests. An operator opening `/customer` and `/customer/entries/:id` ends on `/operator`, with zero `/api/me/*` requests. |
| S7 | `authorization.spec.ts` › unauthenticated / expired | **PASS** ×2 | Anonymous visits to all 4 protected routes go to `/login` without the banner. Each session is revoked in the DB mid-use, as a customer on the tickets tab and as an operator on the queue page; the next action goes to `/login` with "Session expired. Please sign in again.". Re-opening `/customer` stays on `/login`. Signing in again works and clears the banner. A normal logout shows no banner. |
| S8 | `authorization.spec.ts` › cross-customer | **PASS** ×2 | customer2 opens customer1's entry URL. The API returns `404 RESOURCE_NOT_FOUND` with no customer1 id. The page shows only "We couldn't find that queue entry."; no entry card, number, entry id, customer1 id or email is on the page. |
| S9 | `responsive.spec.ts` › UI-001 at 360 × 800 | **PASS** ×2 | See below |
| S9 | `responsive.spec.ts` › UI-001 at 1280 × 800 | **PASS** ×2 | See below |

S1–S8 are the eight scenarios in Issue #7. S9 is an extra item that verifies UI-001.

**UI-001 result: PASSED.**
- Screens checked: `/login`, `/customer` (both tabs), `/customer/entries/:id`, `/operator`, and `/operator/queues/:id` with the Active, Waiting and Completed sections all populated.
- At both 360 × 800 (touch-enabled context) and 1280 × 800, `document.documentElement.scrollWidth` equalled `clientWidth` and `innerWidth` on every screen (360 or 1280).
- No visible element's box crossed the viewport edge. This check matters because the layouts use `overflow-x-hidden`, which would hide overflow from `scrollWidth`.
- Every primary action was visible, fully inside the viewport horizontally, and at least 44 px tall.
- Measured values and screenshots: [`evidence/README.md`](./evidence/README.md).

### 13.5 Test ID status changes in Issue #7

| Test ID | Before | After | Evidence |
|---|---|---|---|
| FLOW-009 | Pending | **PASSED** | Browser S1 and S5, both runs |
| FLOW-010 | Pending | **PASSED** | Browser S4 and S5, both runs |
| UI-001 | Pending (operator screens) | **PASSED** | Browser S9 at 360 and 1280, both runs; this covers the customer screens again as well as the operator screens |
| PERF-001 | Pending | **Pending** | Not run. NFR-04 needs a seeded 1,000-entry dataset and 100 requests per operation with p95 measured; neither was done. The suite durations above are not performance measurements. |
| REL-001 | Pending | **Pending** | Not run. No application or database restart validation was performed. |

### 13.6 Defect log

**None found.** No Issue #7 test exposed a production defect, and no production file was changed.

Two first-run E2E failures were **test** errors and were fixed in the test code. In S4 and S5, `getByText('Called queue number 1.')` matched both the visible banner and the screen-reader live region, which is a Playwright strict-mode violation. The assertions now target the visible `role="status"` banner.

### 13.7 Not verified / manual checks left

- Only Chromium was run. Firefox, WebKit/Safari, and mobile browsers were not tested.
- No physical touch device was used. The 360 px run used a touch-enabled emulated context only.
- No screen-reader listening test (NVDA, JAWS, VoiceOver, TalkBack). The live-region text was asserted in the DOM (S5), not heard.
- No keyboard-only walkthrough was repeated in #7. The last one is §11, customer screens only.
- PERF-001 and REL-001 were not run (see 13.5).
- No CI run: the repository has no `.github/` workflows. All results are from one local Windows machine.
- The Issue #7 Acceptance Criteria and Definition of Done checklists could not be read in this session (GitHub CLI not authenticated), so they were not ticked here.

### 13.8 Spec gaps found

1. **Wrong-role navigation is not specified.** ui-spec §7 defines only the unauthenticated case ("Redirect to `/login` or show a clear access message"). It does not say what a signed-in customer opening `/operator…`, or an operator opening `/customer…`, should see. The implementation (`ProtectedRoute.tsx`) silently redirects to the user's own home, and E2E S6 asserts that behaviour. This was recorded, not decided; the spec owner should confirm whether a silent redirect is the intended "access message".
2. **The customer status refresh interval is not specified.** ui-spec §5.1 step 7 requires that the customer "sees updated status values". The 10 s polling interval is an implementation decision (Issue #5 decision 2, `usePolling.ts`), not a spec value. E2E S5 allows 15 s per transition based on that decision.

