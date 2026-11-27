# Sprint 2 Completion Table

One row per acceptance criterion. "Executed verification" lists only tests that were actually run. "Accepted release" stays `pending release` until the change is merged to `main`, tagged and deployed.

## F-07 Customer cancellation and queue withdrawal (issue #40)

Contract `f98c296` · red `477febb` · first fully green `61e9daf` · green evidence `37b2c1e` · raw output: [evidence/f07-red-run.txt](./evidence/f07-red-run.txt), [evidence/f07-green-run.txt](./evidence/f07-green-run.txt)

| AC | Implementation | Executed verification | Result | Accepted release |
|---|---|---|---|---|
| AC-17 Owner cancels WAITING; persisted; history readable | `cancelEntry` in `server/src/services/queueService.ts`; route in `server/src/routes/me.ts`; `cancelledAt` in `formatQueueEntry`; migration `20261127090000_f07_queue_entry_cancelled` | CANCEL-002, CANCEL-015 (API+DB); CANCEL-017 (E2E, includes reload) | passed at `61e9daf` | pending release |
| AC-18 Non-WAITING states rejected with 409 | `isCustomerCancellable` in `server/src/services/cancellationPolicy.ts`; button rendered only for WAITING in `client/src/pages/EntryDetailPage.tsx` | CANCEL-001 (unit), CANCEL-003 (API+DB), CANCEL-018 (E2E) | passed at `61e9daf` | pending release |
| AC-19 Non-owner 404, operator 403, 401, CSRF 403, 400 | `requireAuth` → `requireRole(CUSTOMER)` → `requireCsrf` on the route; owner check in `cancelEntry` | CANCEL-004 – CANCEL-008 (API+DB, entry unchanged asserted) | passed at `61e9daf` | pending release |
| AC-20 CLOSED queue cancel allowed | `cancelEntry` does not read queue availability | CANCEL-009 (API+DB) | passed at `61e9daf` | pending release |
| AC-21 Rejoin with a larger number; active guard and index unchanged | No join change; partial unique index untouched | CANCEL-010, CANCEL-011 (API+DB, `pg_indexes` check); CANCEL-017 (E2E) | passed at `61e9daf` | pending release |
| AC-22 Call Next skips cancelled; FIFO kept; operator list hides; 204 | Call Next unchanged (WAITING only); `listOperatorQueueEntries` excludes CANCELLED | CANCEL-012, CANCEL-013 (API+DB, cross-feature F-05) | passed at `61e9daf` | pending release |
| AC-23 Cancel vs Call Next race; double cancel | Conditional `UPDATE ... WHERE status = 'WAITING'` in one transaction | CANCEL-014 (15 rounds), CANCEL-020 (10 rounds) | passed at `61e9daf` | pending release |
| AC-24 UI control, confirmation, busy, errors, keyboard, 360/1280 px | `client/src/components/customer/LeaveQueueControl.tsx`, `EntryDetailPage.tsx`, `StatusBadge.tsx`, `EntryTimestamps.tsx` | CANCEL-016 (client, 14 cases); CANCEL-017 – CANCEL-019 (E2E Chromium) | passed at `61e9daf` | pending release |
| Regression (AC-01 – AC-16) | No Sprint 1 test edited | REG-S2-001: server 140, client 77, E2E 12 Sprint 1 tests inside the full green run | passed at `61e9daf` | pending release |

Not verified: Firefox/WebKit E2E for F-07; PERF-001 for the cancel mutation; the Cloud SQL migration and Cloud Run deployment.
