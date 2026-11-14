# Sprint 1 UI Specification

## 1. Purpose and UX goals

The Sprint 1 user interface supports the minimum viable queue workflow for two roles: `CUSTOMER` and `OPERATOR`. The UI must communicate queue state clearly, enforce server-side authorization, and expose only the data the user is allowed to view. The interface is a browser contract for user behavior; it is not a claim that the application is already implemented.

## 2. Context and assumptions

- Browser clients use the Sprint 1 API described in [../sprint-1/api-spec.md](./api-spec.md)
- Authentication is session-based and uses HTTP-only cookies
- State-changing requests must include a valid CSRF token
- Queue data is always sourced from the API; the UI must not infer queue state locally
- Access control, queue-assignment checks, and privacy enforcement are enforced in the server and must also be reflected in the client UI

## 3. Screen map

| Screen | Role | Purpose |
|---|---|---|
| `/login` | Anonymous | Sign-in screen for CUSTOMER and OPERATOR users |
| `/customer` | CUSTOMER | View OPEN queues and current queue membership; split into two sections: Available Queues and My Active Tickets |
| `/customer/entries/:id` | CUSTOMER | Read the customer’s own queue entry and lifecycle state |
| `/operator` | OPERATOR | View assigned queues and queue activity overview |
| `/operator/queues/:id` | OPERATOR | Manage queue lifecycle actions: call next, start, complete |

### `/customer` screen structure

The `/customer` page must contain two clearly separated sections:

#### Tab 1 — Available Queues
Purpose: discover queues that are currently `OPEN` and allow the customer to join.

API mapping:
- `GET /api/queues`
- Join action uses `POST /api/queues/{queueId}/entries`

UI components:
- queue cards
- queue name
- queue availability status
- Join Queue button

Behavior:
- Display only queues eligible for joining according to the API contract.
- Disable the Join Queue button while the request is in flight.
- Show clear success or error feedback after the request resolves.

#### Tab 2 — My Active Tickets
Purpose: show the current customer’s queue entries.

API mapping:
- `GET /api/me/queue-entries`

UI components:
- queue entry cards or list
- queue number badge
- queue name
- current status
- relevant timestamps
- View Details link

Navigation:
- Selecting an entry opens `/customer/entries/:id`.
- The detail page must call `GET /api/me/queue-entries/{entryId}` and enforce customer ownership.

## 4. Interaction rules

- Customers can list only `OPEN` queues.
- Customers may join multiple different queues but may hold only one active entry per customer per queue.
- A customer sees only their own queue entries; cross-owner access is denied by the API and should display a safe generic not-found style message in the UI.
- Operators see only queues assigned to them and no other queue data.
- Operator actions are hidden or disabled when the current queue entry state does not permit the action.
- The queue number and lifecycle status must be visible to the user after successful queue join.
- The UI must show neutral empty states instead of throwing server errors when a queue has no eligible waiting entry.
- Errors must be presented as user-safe messages without stack traces, SQL messages, or internal server details.

### Submission Loading State and Double Submission Prevention

Every action button (`Login`, `Join Queue`, `Call Next`, `Start`, and `Complete`) must enter a disabled state with a visible spinner immediately upon submission and remain disabled until the corresponding API request resolves.

Normative behavior:
1. On the first user submission, immediately set the relevant action to a pending state.
2. Disable the corresponding button immediately.
3. Display a visible loading spinner.
4. Prevent repeated clicks from creating duplicate requests.
5. Restore the button state when the request resolves.
6. Display success or error feedback according to the API response.
7. Preserve the existing form or queue state when the request fails, unless the API contract requires a refresh.

Action-specific behavior:

| Action | Pending text | Disabled condition |
|---|---|---|
| Login | `Signing in...` | Authentication request pending |
| Join Queue | `Joining queue...` | Join request pending |
| Call Next | `Calling next...` | Call-next request pending |
| Start | `Starting service...` | Start request pending |
| Complete | `Completing service...` | Complete request pending |

Additional rules:
- Prevent duplicate submission at the component/action level.
- Do not disable unrelated actions unnecessarily.
- Keep existing business-state restrictions.
- Backend validation and concurrency protection remain authoritative.
- A frontend disabled button must never be treated as the only duplicate-prevention mechanism.

## 5. Role-specific screens and flows

### 5.1 Customer flow

1. Open the login screen.
2. Authenticate as a `CUSTOMER`.
3. View a catalog of only `OPEN` queues.
4. Select a queue and join it.
5. Receive the assigned queue number and the status `WAITING`.
6. View their own queue entry card or detail page.
7. When the entry transitions, the customer sees updated status values without seeing other customers’ data.

Required customer-visible fields:
- queue name
- assigned queue number
- current status (`WAITING`, `CALLED`, `SERVING`, `COMPLETED`)
- joined time
- applicable lifecycle timestamps if available
- queue-specific message such as “You are next” or “Currently waiting”

### 5.2 Operator flow

1. Open the login screen.
2. Authenticate as an `OPERATOR`.
3. View the list of queues assigned to the operator.
4. Select a queue and view entries in deterministic FIFO order.
5. Call the next eligible waiting entry.
6. Start service for the called entry.
7. Complete service for the serving entry.
8. Refresh or re-fetch the queue state after each action.

Required operator-visible fields:
- assigned queue name
- all queue entries for the queue in FIFO order
- queue number, customer identifier used for operator management, and current status
- transition actions permitted by the lifecycle state

## 6. Status behavior and labels

| QueueEntry status | UI label | Meaning |
|---|---|---|
| `WAITING` | Waiting | Customer is in line and not yet called |
| `CALLED` | Called | Customer has been selected and should approach the service desk |
| `SERVING` | In service | Customer is actively receiving service |
| `COMPLETED` | Completed | Service is complete and the entry is terminal |

The UI must use text and icons, not color alone, to indicate status. The displayed labels must be consistent with the API contract and the SRS.

## 7. Error states and empty states

| Case | Expected behavior |
|---|---|
| Unauthenticated user | Redirect to `/login` or show a clear access message |
| Invalid credentials | Show a validation error without exposing account existence |
| CSRF failure | Show a non-sensitive session-expired or request-invalid message |
| Operator not assigned to queue | Show `403 FORBIDDEN`-style message and do not reveal queue internals |
| Cross-owner customer access attempt | Show a generic `404 RESOURCE_NOT_FOUND`-style message |
| Queue is empty when calling next | Show neutral empty state, leave queue unchanged, and keep existing entries visible |
| Invalid lifecycle transition | Show a conflict message and refresh queue data from the source of truth |
| Closed queue join attempt | Show a queue unavailable message and keep the form enabled |
| Duplicate active entry | Show a “you already have an active entry in this queue” message |

### Session Expiry Handling (401 UNAUTHORIZED)

When any authenticated API request returns HTTP `401` with the error code `UNAUTHORIZED`, the UI must clear client-side session state and immediately redirect the user to `/login` with the informational banner:

`Session expired. Please sign in again.`

Required behavior:
1. Detect an authenticated API response with HTTP `401`.
2. Clear the client-side authenticated user/session state.
3. Prevent access to protected screens using stale client-side state.
4. Redirect the user to `/login`.
5. Display the exact informational message: `Session expired. Please sign in again.`
6. Do not repeatedly redirect if the user is already on `/login`.
7. Do not show sensitive server details in the banner.
8. Allow the user to authenticate again.

This redirect applies only to authenticated requests returning `401 UNAUTHORIZED`. Login failures continue to show their appropriate authentication error instead of being mistaken for a session-expiry event.

## 8. Accessibility and responsiveness

### 8.1 Accessibility requirements

- All form fields and actions must have visible labels
- Focus state must be visible for keyboard interaction
- Interactive elements must be large enough for touch use on mobile devices
- Screen-reader announcements must be available for queue state changes and validation failures
- Status messages must not rely on color alone

### 8.2 Responsive requirements

- The page must not produce horizontal overflow at 360 px and 1280 px widths
- Mobile layouts must prioritize a single-column queue flow
- Desktop layouts may use wider tables or panels where the content remains readable
- Forms must remain usable on small screens without clipped action buttons or hidden labels

## 9. UI validation rules

- Validate required fields before submission
- Disable or suppress actions that are not allowed in the current queue state
- Re-fetch the queue state after a successful mutation so the UI reflects the API’s committed state
- Do not allow a customer to attempt a queue join for a closed queue
- Do not allow an operator to start or complete a queue entry that is not in the correct lifecycle state
- Keep customer and operator views separate and do not reveal private customer data to other customers
- Preserve the loading-state and double-submission rules defined in Section 4
- Apply the session-expiry handling defined in Section 7 to authenticated requests returning `401 UNAUTHORIZED`

## 10. Quality bar for Sprint 1

The UI must support the critical Sprint 1 flows:
- login for CUSTOMER and OPERATOR
- queue discovery for `OPEN` queues
- queue join and assignment of a queue number
- customer status tracking for their own entry
- operator call-next, start, and complete actions
- safe handling of privacy violations and invalid state transitions

This UI contract aligns with the SRS, system SDS, and Sprint 1 API specification and supports the required Sprint 1 acceptance criteria.
