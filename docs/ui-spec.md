# Sprint 1 UI Specification

UI is a presentation client; API authorization and state are authoritative. Screens use accessible labels, keyboard operation, visible focus and text plus color for status. At 360 CSS px the layout is single-column, tables become cards/scroll regions without page-level horizontal overflow; at ≥1280 px dashboards may use two columns. Loading, empty, error and success states are required on every data screen.

## Navigation and route protection

| Role/session | Routes |
|---|---|
| Anonymous | `/login/customer`, `/login/operator` |
| CUSTOMER | `/customer` dashboard; `/customer/entries/:id` own detail |
| OPERATOR | `/operator` dashboard; `/operator/queues/:id` management |

Client route guards improve navigation only. API enforces permissions. Authenticated users sent to the other role's routes are redirected to their own home; denied API response displays an access error and clears local auth state only on 401. Logout calls API and clears cached private data. Operator login form does not imply role: server returns role, and a Customer attempting operator login receives a generic role mismatch/access message after successful authentication policy is decided; recommended behavior is authenticate then redirect to the customer's home.

## Screen contracts

| Screen / role | Layout and data | Actions / validation | Loading, empty, error and success |
|---|---|---|---|
| Customer Login (`/login/customer`) | Centered form: email and password; password visibility toggle; no account registration link in Sprint 1. | Submit valid email/password; required fields; trim email only; never trim password. Call `POST /auth/login`. | Disable submit during request. Empty fields show inline errors. Bad credentials use generic message. Success routes `/customer`; do not echo credentials. |
| Operator Login (`/login/operator`) | Same form and shared visual system; operator context label. | Same validation; server role decides redirect. | Same error behavior; if authenticated Customer, deny operator route and send to customer home. |
| Customer Dashboard (`/customer`) | Header with user role/logout; available queue cards; “My queue entries” list with queue name, number, status, join time. | Load catalog and own entries. Join from OPEN card. Disable join button while pending; do not optimistically create entry. | Initial skeleton; no queues / no entries empty message; API error with retry; success toast and display persisted number. Prevent duplicate clicks; 409 DUPLICATE_ACTIVE_ENTRY refreshes list and explains existing active entry. |
| Customer Queue Details (`/customer/entries/:id`) | Private entry number, queue, status and timestamps; no other customer's data or customer PII. | Back to dashboard; refresh/reload via API. No lifecycle mutation controls. | Skeleton; 404 generic “entry not found”; retryable server error; status text plus icon/color. |
| Operator Dashboard (`/operator`) | Assigned queue cards with name, availability and waiting count if API supports it; no cross-queue details. | Select assigned queue; logout. | Loading skeleton; no assignments empty state; retry on failure; 403 explains access denied without exposing queue. |
| Operator Queue Management (`/operator/queues/:id`) | Queue header; entries by FIFO with number, status, join time and minimal service display data; action area for next/called/serving entry. | Call Next; Start only CALLED; Complete only SERVING. Confirm no destructive action is needed. Disable buttons while request pending and refresh after mutation. | Empty queue shows “No waiting entries”; 204 leaves list unchanged with neutral feedback. 409 refreshes state and asks operator to retry. Other errors show retry. Completed entries may appear in history but no active controls. |

## Shared presentation behavior

- Status labels are exact: Waiting, Called, In service, Completed; map respectively to `WAITING`, `CALLED`, `SERVING`, `COMPLETED`. Use status text and icon, never color alone.
- Private customer detail is available only on own-entry screen. Queue catalog never includes customer data. Operator queue view shows only minimum data needed to identify service, not email or phone.
- Use API response as source of truth. Refresh on page load, explicit refresh and after successful mutation; no polling is required for Sprint 1. Optional manual refresh control announces completion to assistive technology.
- Handle 401 by clearing cached user/private data and navigating to role login. Handle 403 with access-denied screen. Handle 404 with generic unavailable/not-found copy. Map 409 codes to actionable messages. Never display raw server error, stack, SQL, or secrets.
- Ignore repeat clicks while a request is in flight; retain inputs on recoverable network failure. Do not use optimistic lifecycle transitions. After duplicate join or concurrent mutation conflict, refetch state.
- On narrow screens, stack cards and controls; provide comfortable touch targets and readable wrapping. Forms have visible labels and inline field errors.

Screen coverage: FR-01/02 login/logout; FR-03 route permissions; FR-04/05 queue discovery/join; FR-07 own details; FR-08–11 operator workflow. See AC-01–17 and API contract.
