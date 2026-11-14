# Sprint 1 Test Evidence (Issue #7)

Every PNG in this folder is written by the Playwright suite (`npm run test:e2e`). Each run overwrites them under the same names. They come from headless Chromium (Playwright 1.63.0, Chrome for Testing 153.0.8010.12) against the isolated test database. Flow screenshots show the 1280 × 800 viewport; `responsive-*` screenshots are full-page. The screenshots contain only seeded test accounts and test UUIDs. No cookie, token, connection string or secret appears in them. The password field on the login screenshot is masked.

- `e2e-run.txt`: counts-only summary of the two consecutive E2E runs recorded for Issue #7. It is written by `e2e/helpers/summary-reporter.ts`.
- `issue7-coverage.md`: gap analysis and scenario map.

## Screenshots

| File | Scenario / test | Test IDs | Shows |
|---|---|---|---|
| `customer-01-login.png` | S1 `customer-flow.spec.ts` | FLOW-009 | Login form filled in for customer1 (password masked) |
| `customer-02-queues.png` | S1 | FLOW-009, QUEUE-001 | Available Queues tab listing only the OPEN queue |
| `customer-03-joined.png` | S1 | FLOW-009, QUEUE-002 | Join confirmation with queue number 1 and status Waiting |
| `customer-04-detail-waiting.png` | S1 | FLOW-009 | Entry detail: number, queue name, Waiting, joined time, "You are next" |
| `customer-05-duplicate-rejected.png` | S2 | QUEUE-003 | "You already have an active entry in this queue." |
| `customer-06-sees-called.png` | S5 | FLOW-009/010 | Customer detail updated by polling to Called after the operator's Call Next |
| `customer-07-sees-completed.png` | S5 | FLOW-009/010 | Customer detail updated to Completed with all four timestamps |
| `operator-01-dashboard.png` | S3 `operator-flow.spec.ts` | RBAC-004 | operator1's dashboard showing only the assigned queue |
| `operator-02-waiting-fifo.png` | S3 | QUEUE-007 | Waiting list in FIFO order (positions 1 and 2) |
| `operator-07-unassigned-forbidden.png` | S3 | RBAC-004 | operator2 opening the queue URL: "You do not have permission to manage this queue." |
| `operator-03-called.png` | S4 | FLOW-010, FLOW-002 | After Call Next: entry Called; Start enabled, Complete disabled |
| `operator-04-serving.png` | S4 | FLOW-010, FLOW-004 | After Start Service: In service; Complete enabled |
| `operator-05-completed.png` | S4 | FLOW-010, FLOW-006 | After Complete Service: entry in the Completed section |
| `operator-06-empty-call-next.png` | S4 | FLOW-003 | Call Next with nothing waiting: "No waiting entries to call right now." |
| `forbidden-customer-on-operator.png` | S6 `authorization.spec.ts` | RBAC-001–004 (UI) | Customer who opened `/operator/queues/:id` ends on `/customer` |
| `forbidden-operator-on-customer.png` | S6 | RBAC (UI) | Operator who opened `/customer/entries/:id` ends on `/operator` |
| `session-expired-banner.png` | S7 | AUTH-005 (UI), ui-spec §7 | `/login` with "Session expired. Please sign in again." after server-side session revocation |
| `cross-customer-not-found.png` | S8 | QUEUE-006, RBAC-005 | customer2 on customer1's entry URL: "We couldn't find that queue entry." and no entry data |
| `responsive-360-01-login.png`, `responsive-1280-01-login.png` | S9 `responsive.spec.ts` | UI-001 | `/login` |
| `responsive-360-02-customer-queues.png`, `responsive-1280-02-customer-queues.png` | S9 | UI-001 | `/customer`, Available Queues |
| `responsive-360-03-customer-tickets.png`, `responsive-1280-03-customer-tickets.png` | S9 | UI-001 | `/customer`, My Active Tickets (one WAITING, one COMPLETED) |
| `responsive-360-04-customer-entry.png`, `responsive-1280-04-customer-entry.png` | S9 | UI-001 | `/customer/entries/:id` |
| `responsive-360-05-operator-dashboard.png`, `responsive-1280-05-operator-dashboard.png` | S9 | UI-001 | `/operator` |
| `responsive-360-06-operator-queue.png`, `responsive-1280-06-operator-queue.png` | S9 | UI-001 | `/operator/queues/:id` with the Active, Waiting and Completed sections all filled |

## Measured layout (S9, both runs identical)

| Screen | 360 × 800: scrollWidth / clientWidth / innerWidth | 1280 × 800: scrollWidth / clientWidth / innerWidth |
|---|---|---|
| `/login` | 360 / 360 / 360 | 1280 / 1280 / 1280 |
| `/customer` Available Queues | 360 / 360 / 360 | 1280 / 1280 / 1280 |
| `/customer` My Active Tickets | 360 / 360 / 360 | 1280 / 1280 / 1280 |
| `/customer/entries/:id` | 360 / 360 / 360 | 1280 / 1280 / 1280 |
| `/operator` | 360 / 360 / 360 | 1280 / 1280 / 1280 |
| `/operator/queues/:id` | 360 / 360 / 360 | 1280 / 1280 / 1280 |

On every screen, no visible element's box crossed the viewport edge (`.sr-only` text excluded). The layouts use `overflow-x-hidden`, which can hide overflow from `scrollWidth`, so this second check is needed. Each primary action was checked to be visible, fully inside the viewport horizontally, and at least 44 px tall: Sign in, the two inputs, the tabs, Join Queue, Logout, Refresh, View details, Back links, Manage queue, Call Next, Start Service and Complete Service. The 360 px run used a touch-enabled context.
