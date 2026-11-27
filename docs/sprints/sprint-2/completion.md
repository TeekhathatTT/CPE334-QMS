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
| NFR-04 for F-07 (cancel, rejoin, Call Next, operator list and entry detail with cancelled rows) | No performance-specific code; conditional `UPDATE` by primary key in `cancelEntry` | PERF-S2-001 (`npm run test:perf:f07 --workspace=server`, 1,000-entry dataset, 100 timed requests per operation): cancel p95 16.4 ms, worst read p95 47.0 ms, worst mutation p95 17.9 ms ([evidence/perf-s2-001.txt](./evidence/perf-s2-001.txt)) | passed (run 2026-11-27 on the `61e9daf` code) | pending release |

Not verified: Firefox/WebKit E2E for F-07; the Cloud SQL migration and Cloud Run deployment; latency on Cloud Run / Cloud SQL and under concurrent load.

*Rev. 2026-11-27:* the NFR-04 row was added after PR #56 review. The previous "Not verified" line also listed "PERF-001 for the cancel mutation".

## F-08 No-show handling and recovery (issue #41)

Contract `7e42e1f` · red `f6a4183` · first fully green `37fd6c0` · green evidence `b65c0d2` · raw output: [evidence/f08-red-run.txt](./evidence/f08-red-run.txt), [evidence/f08-green-run.txt](./evidence/f08-green-run.txt), [evidence/perf-s2-002.txt](./evidence/perf-s2-002.txt)

| AC | Implementation | Executed verification | Result | Accepted release |
|---|---|---|---|---|
| AC-25 Assigned operator marks a CALLED entry NO_SHOW; persisted; CLOSED queue too | `markNoShowEntry` in `server/src/services/operatorService.ts`; route `POST /api/operator/queue-entries/:entryId/no-show` in `server/src/routes/operator.ts`; migration `20261127120000_f08_queue_entry_no_show`; new fields in `formatQueueEntry` | NOSHOW-002 (API+DB); NOSHOW-017 (E2E) | passed at `37fd6c0` | pending release |
| AC-26 No-show rejected in other states; Start/Complete reject NO_SHOW | `canMarkNoShow` in `server/src/services/noShowPolicy.ts` | NOSHOW-001 (unit), NOSHOW-003, NOSHOW-020 (API+DB) | passed at `37fd6c0` | pending release |
| AC-27 Access control for both actions | `requireAuth` → `requireCsrf` → `requireRole(OPERATOR)`; assignment check in the service | NOSHOW-004, NOSHOW-005 (API+DB, row unchanged asserted) | passed at `37fd6c0` | pending release |
| AC-28 Return to the original FIFO position; CLOSED queue too | `recoverNoShowEntry` (queue-row lock, entry lock, `calledAt` cleared, `recoveredAt` set) | NOSHOW-006 (API+DB, cross-feature F-05); NOSHOW-017 (E2E) | passed at `37fd6c0` | pending release |
| AC-29 Recovery limit; invalid states; DB CHECK 0–2 | `recoveryDecision`; `RECOVERY_LIMIT_REACHED`; `QueueEntry_noShowCount_range_check` | NOSHOW-001, NOSHOW-007, NOSHOW-008; NOSHOW-017 (E2E) | passed at `37fd6c0` | pending release |
| AC-30 Rejoin while NO_SHOW blocks a return; F-07 cancel interaction | other-active-entry check + P2002 backstop in `recoverNoShowEntry`; no change to join or cancel | NOSHOW-009, NOSHOW-010 (API+DB, cross-feature F-04/F-07) | passed at `37fd6c0` | pending release |
| AC-31 Call Next skips NO_SHOW; operator list shows it; aheadCount ignores it | no code change (Call Next and `aheadCount` select only WAITING; list filter excludes only CANCELLED) | NOSHOW-011 (API+DB) | passed at `37fd6c0` | pending release |
| AC-32 Races: no-show vs Start, double return, return vs rejoin | row lock (no-show), queue-row then entry lock (return) | NOSHOW-012, NOSHOW-013, NOSHOW-014 (10 rounds each) | passed at `37fd6c0` (NOSHOW-014: only the "join wins" outcome was observed) | pending release |
| AC-33 Operator UI controls, busy, errors, keyboard, 360/1280 px | `client/src/pages/OperatorQueueDetailPage.tsx`, `client/src/api/operator.ts`, `client/src/api/noShow.ts` | NOSHOW-015 (client); NOSHOW-017, NOSHOW-019 (E2E Chromium) | passed at `37fd6c0` | pending release |
| AC-34 Customer view of NO_SHOW and of a returned entry | `client/src/pages/EntryDetailPage.tsx`, `StatusBadge.tsx`, `EntryTimestamps.tsx` | NOSHOW-016 (client); NOSHOW-018 (E2E) | passed at `37fd6c0` | pending release |
| NFR-04 for F-08 | — | PERF-S2-002: no-show p95 30.4 ms, recover p95 41.7 ms, reads ≤ 117.4 ms | passed (run 2026-11-27 on the `37fd6c0` code) | pending release |
| Regression (AC-01 – AC-24) | No existing test file edited | REG-S2-002: all Sprint 1 and F-07 tests inside the full green run (server 161, client 91, E2E 15) | passed at `37fd6c0` | pending release |

Not verified for F-08: Firefox/WebKit E2E; the Cloud SQL migration and Cloud Run deployment; latency on Cloud Run / Cloud SQL and under concurrent load; the "return wins" outcome of the NOSHOW-014 race (not observed in 20 rounds).
