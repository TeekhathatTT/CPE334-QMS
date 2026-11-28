# Sprint 3 Test Specification (canonical STS)

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-28 | @TeekhathatTT (review: @Khwanklao, pending) | First Sprint 3 STS (issue #44): F-11 (`ANALYTICS-001`–`ANALYTICS-012`, `PERF-S3-001`, `REG-S3-001`), F-12 (`APPT-001`–`APPT-020`, `PERF-S3-002`) and F-13 (`HARD-001`–`HARD-012`). All tests are `planned`. |

## 1. Conventions

- Levels:
  - Unit: Vitest, pure functions.
  - API+DB: Vitest and supertest against PostgreSQL 16 `qms_test_db`, reset per file.
  - Client: Vitest and React Testing Library, with the API mocked.
  - E2E: Playwright, Chromium unless stated otherwise.
- "Unchanged" means a row snapshot (every column) of the affected tables is identical before and after the request.
- A test counts as passed only after it has been executed. Results go in §5 and in `docs/sprints/sprint-3/completion.md`.
- No existing Sprint 1 or Sprint 2 test may be edited to make a Sprint 3 test pass.

## 2. F-11 Operational analytics

### 2.1 Known dataset `DS-11`

Queue Q = General Inquiry Desk (`aaaaaaaa-…`). Other queue R = Specialized Consultation (`bbbbbbbb-…`). Rows are inserted directly by Prisma with explicit UTC timestamps. Asia/Bangkok = UTC+07:00. "+Ns" means N seconds after `joinedAt`.

| Row | Queue | `joinedAt` (UTC) | Bangkok date | Final status | `calledAt` | `serviceStartedAt` | `completedAt` | Other | Wait s | Service s |
|---|---|---|---|---|---|---|---|---|---|---|
| E1 | Q | 2026-11-20T02:00:00Z | 11-20 | COMPLETED | +300 | +360 | +960 | — | 300 | 600 |
| E2 | Q | 2026-11-20T03:00:00Z | 11-20 | COMPLETED | +120 | +150 | +450 | — | 120 | 300 |
| E3 | Q | 2026-11-21T02:00:00Z | 11-21 | COMPLETED | +600 | +620 | +1520 | — | 600 | 900 |
| E4 | Q | 2026-11-21T04:00:00Z | 11-21 | CANCELLED | — | — | — | `cancelledAt` +200 | — | — |
| E5 | Q | 2026-11-22T02:00:00Z | 11-22 | NO_SHOW | +450 | — | — | `noShowAt` +630, `noShowCount` 1 | 450 | — |
| E6 | Q | 2026-11-22T05:00:00Z | 11-22 | COMPLETED | +900 (latest call) | +960 | +1440 | `noShowAt` +400, `recoveredAt` +500, `noShowCount` 1, `priority` PRIORITY | 900 | 480 |
| E7 | Q | 2026-11-24T02:00:00Z | 11-24 | SERVING | +60 | +90 | — | — | 60 | — |
| E8 | Q | 2026-11-26T09:00:00Z | 11-26 | WAITING | — | — | — | — | — | — |
| E9 | Q | 2026-11-26T16:59:59.999Z | 11-26 | CALLED | +30 | — | — | — | 30 | — |
| X1 | Q | 2026-11-26T17:00:00.000Z | 11-27 (outside) | WAITING | — | — | — | excluded | — | — |
| X2 | Q | 2026-11-19T16:59:59.999Z | 11-19 (outside) | COMPLETED | +100 | +110 | +210 | excluded | — | — |
| X3 | R | 2026-11-21T02:00:00Z | 11-21 | COMPLETED | +50 | +60 | +160 | other queue, excluded | — | — |

Each row uses a different seeded customer where BR-05/BR-06 would matter. Direct inserts bypass the API, so the caps do not apply to them. `queueNumber` values are sequential per queue.

**Expected result** for `from=2026-11-20&to=2026-11-26`:

- `volumes`: `joined` 9, `waiting` 1, `called` 1, `serving` 1, `completed` 4, `cancelled` 1, `noShow` 1, `recovered` 1, `priority` 1.
- `waitTime` samples are [30, 60, 120, 300, 450, 600, 900]: `count` 7, `averageSeconds` 351.4 (2460 / 7 = 351.43), `medianSeconds` 300.0, `p90Seconds` 720.0 (position 5.4, so 600 + 0.4 × 300), `maxSeconds` 900.0.
- `serviceTime` samples are [300, 480, 600, 900]: `count` 4, `averageSeconds` 570.0, `medianSeconds` 540.0, `p90Seconds` 810.0 (position 2.7, so 600 + 0.7 × 300), `maxSeconds` 900.0.
- `daily`:

| date | joined | completed | cancelled | noShow | averageWaitSeconds | averageServiceSeconds |
|---|---|---|---|---|---|---|
| 2026-11-20 | 2 | 2 | 0 | 0 | 210.0 | 450.0 |
| 2026-11-21 | 2 | 1 | 1 | 0 | 600.0 | 900.0 |
| 2026-11-22 | 2 | 1 | 0 | 1 | 675.0 | 480.0 |
| 2026-11-23 | 0 | 0 | 0 | 0 | null | null |
| 2026-11-24 | 1 | 0 | 0 | 0 | 60.0 | null |
| 2026-11-25 | 0 | 0 | 0 | 0 | null | null |
| 2026-11-26 | 2 | 0 | 0 | 0 | 30.0 | null |

### 2.2 Test matrix

| ID | Level | Setup | Input | Expected | AC |
|---|---|---|---|---|---|
| ANALYTICS-001 | Unit | `analyticsPolicy.ts` | `summarizeDurations` with `[]`, `[42]`, the DS-11 wait samples, the service samples, and `[1, 2]` (median 1.5); rounding cases 0.05 → 0.1 and 351.428 → 351.4; `parseAnalyticsRange` with valid, impossible, reversed, 31-day and 32-day ranges; `bangkokDate` at 16:59:59.999Z and 17:00:00.000Z | the values listed; `null` stats for `[]`; `INVALID_ARGUMENT` for the bad ranges | AC-56, AC-58, AC-59 |
| ANALYTICS-002 | API+DB | DS-11, operator1 assigned to Q | `GET /api/operator/queues/Q/analytics?from=2026-11-20&to=2026-11-26` | `200`, deep-equal to the §2.1 expected result (`queueName`, `timezone`, `from`, `to` included) | AC-56 |
| ANALYTICS-003 | API+DB | DS-11 | range 2026-11-23 to 2026-11-23, and range 2026-12-01 to 2026-12-07 | `200`, `joined` 0, all stats `null`, 1 and 7 zero rows respectively | AC-57 |
| ANALYTICS-004 | API+DB | DS-11 | the full range | E8 counts in `volumes.waiting` only. E7 and E9 count in `waitTime` but not `serviceTime`. E4 counts in `cancelled` only. E5 counts in `noShow` and `waitTime`. E6's wait is 900. X1, X2 and X3 are absent. Asserted through per-row variants: remove one row and compare the deltas. | AC-57 |
| ANALYTICS-005 | API+DB | DS-11 | `from=to=2026-11-26`; `from=to=2026-11-27` | the first includes E8 and E9 (`joined` 2) and has exactly 1 daily row; the second includes X1 only (`joined` 1) | AC-58 |
| ANALYTICS-006 | API+DB | — | missing `from`; missing `to`; `2026-11-5`; `2026-02-30`; `from > to`; a 32-day span; `&foo=1`; malformed `queueId` | each `400 INVALID_ARGUMENT` | AC-59 |
| ANALYTICS-007 | API+DB | — | no session; customer1; operator2 (unassigned to Q); an unknown UUIDv4 queue as operator1 | `401`; `403`; `403`; `404` | AC-60 |
| ANALYTICS-008 | API+DB | DS-11 | snapshot of `QueueEntry` and `ServiceQueue`, then 3 analytics calls, then a second snapshot | snapshots identical; the response has no `Set-Cookie` change beyond the session refresh rule | AC-60 |
| ANALYTICS-009 | API+DB | DS-11, then one live F-05 lifecycle on a new entry joined "today" | today's range before and after Call Next, Start and Complete | `waitTime.count` and `serviceTime.count` grow by exactly 1 each, with the values from the stored timestamps | AC-56, AC-57 |
| ANALYTICS-010 | Client | mocked API returning the §2.1 result | render `/operator/queues/Q/analytics` | default range is the last 7 days (fixed `Date` in the test); figures render (`5m 51s` for 351.4 s, `—` for `null`); the table has a caption and 7 rows; the link from the queue page exists | AC-62 |
| ANALYTICS-011 | Client | mocked `400`, `403`, `404`, network error, empty result; client validation | submit the form | the §2.3 messages; Retry refetches; reversed and 32-day ranges are blocked client-side with messages; the busy state disables the button | AC-62 |
| ANALYTICS-012 | E2E | seeded DB; operator1 runs a journey (join, call, start, complete) to create data for today | open the queue, click **Analytics**, then **Show report** | joined ≥ 1 and completed ≥ 1 shown; keyboard-only path; no horizontal overflow at 360 × 800 and 1280 × 800; screenshots `f11-*.png` | AC-62 |
| PERF-S3-001 | Perf | 1,000 entries across 31 days in Q (mixed statuses) | 100 timed `GET …/analytics` at the 31-day range | p95 ≤ 500 ms; raw output saved to `evidence/perf-s3-001.txt` | AC-61 |
| REG-S3-001 | Regression | — | the full server, client and E2E suites | every Sprint 1 and Sprint 2 test passes **unmodified** | AC-62 |

### 2.3 Acceptance coverage

| AC | Tests |
|---|---|
| AC-56 | ANALYTICS-001, 002, 009 |
| AC-57 | ANALYTICS-003, 004, 009 |
| AC-58 | ANALYTICS-001, 005 |
| AC-59 | ANALYTICS-001, 006 |
| AC-60 | ANALYTICS-007, 008 |
| AC-61 | PERF-S3-001 |
| AC-62 | ANALYTICS-010, 011, 012, REG-S3-001 |

### 2.4 Not planned in F-11

- Firefox and WebKit E2E: covered in F-13 (NFR-12).
- Latency on Cloud Run: post-deploy checks are functional only.
- Analytics under concurrent writes beyond ANALYTICS-009: the endpoint is a single READ COMMITTED read and holds no locks.

## 3. F-12 Advance appointment booking

All `planned`. Implementation is due 13 December.

| ID | Level | Scenario | AC |
|---|---|---|---|
| APPT-001 | Unit | Window helpers: booking open and close, cancel cutoff, check-in open and close, and `effectiveStatus` at boundary instants (exact, −1 ms, +1 ms) | AC-66, AC-68–AC-70 |
| APPT-002 | API+DB | Operator creates a slot: `201`, row persisted `OPEN` | AC-63 |
| APPT-003 | API+DB | Slot validation: duration 14 or 121, capacity 0 or 21, `startsAt` in 59 minutes, extra field → `400`; same `startsAt` → `409 DUPLICATE_SLOT`; database `CHECK` on capacity | AC-63 |
| APPT-004 | API+DB | Slot access: no session `401`, customer `403`, unassigned operator `403`, unknown queue `404` | AC-63 |
| APPT-005 | API+DB | Close slot `200` and idempotent; booking a closed slot → `409 SLOT_CLOSED`; existing booking can still cancel and check in | AC-64 |
| APPT-006 | API+DB | Customer slot list: only `OPEN`, in-window, not-full slots, ordered, with `remainingCapacity`; `CLOSED` queue → `409` | AC-65 |
| APPT-007 | API+DB | Book success `201`; persisted `BOOKED`; `remainingCapacity` decrements | AC-66 |
| APPT-008 | API+DB | Book rejections: full, closed, 59 minutes ahead, 14 days + 1 minute ahead, second booking in the same queue, `CLOSED` queue. Each returns the code and leaves the rows unchanged. | AC-66 |
| APPT-009 | API+DB concurrency | 15 rounds: 6 customers in parallel on capacity 4 → exactly 4 × `201` and 2 × `SLOT_FULL`; count ≤ capacity; zero deadlocks | AC-67 |
| APPT-010 | API+DB concurrency | 15 rounds: the same customer books 2 slots of one queue in parallel → 1 × `201` and 1 × `DUPLICATE_BOOKING` | AC-67 |
| APPT-011 | API+DB | Cancel before start `200`; place freed; cancel at start → `409 BOOKING_WINDOW_CLOSED`; cancel twice → `409 INVALID_STATE_TRANSITION`; another owner → `404` | AC-68 |
| APPT-012 | API+DB | Check-in inside the window `201`: entry `WAITING`, `priority` PRIORITY, next `queueNumber`; appointment `CHECKED_IN` and linked | AC-69 |
| APPT-013 | API+DB | Check-in at −16 minutes and +16 minutes → `409 CHECK_IN_WINDOW_CLOSED`; a second check-in → `409 INVALID_STATE_TRANSITION` | AC-69 |
| APPT-014 | API+DB cross-feature | A checked-in entry is called before an older `NORMAL` entry (F-10). It appears in F-11 analytics. Cancelling it through F-07 does not change the appointment. | AC-69 |
| APPT-015 | API+DB | `effectiveStatus` `MISSED` after +15 minutes; stored status stays `BOOKED`; cancel and check-in rejected | AC-70 |
| APPT-016 | API+DB | Check-in blocked by an active entry in the queue, by 2 active entries, or by a `CLOSED` queue → the respective `409`; the appointment stays `BOOKED`; no entry is created | AC-71 |
| APPT-017 | API+DB concurrency | 15 rounds: check-in vs a customer join in the same queue → exactly one active entry; zero deadlocks | AC-67, AC-71 |
| APPT-018 | Client | Booking, my appointments and operator slots: states, messages for every `409`, buttons shown only when allowed | AC-72 |
| APPT-019 | E2E | Operator creates a slot; the customer books, sees it, checks in (slot made relative to now) and sees the queue entry; 360 px and 1280 px | AC-72 |
| APPT-020 | Migration | Partial unique index, `CHECK`s and FKs exist (`pg_indexes`, `pg_constraint`); existing constraints unchanged | AC-66, AC-67 |
| PERF-S3-002 | Perf | 1,000 appointments: list, book, cancel and check-in p95 within NFR-04 | NFR-04 |

## 4. F-13 Product hardening and launch readiness

All `planned`. Due 13 December.

| ID | Level | Scenario | AC |
|---|---|---|---|
| HARD-001 | API | `GET /`, `GET /api/health`, `POST /api/auth/login` (401) and an unknown API route return the NFR-09 headers; no `X-Powered-By`; HSTS only when `NODE_ENV=production` | AC-73 |
| HARD-002 | E2E | The customer and operator journeys log zero CSP violations (`page.on('console')` and `securitypolicyviolation`) | AC-73 |
| HARD-003 | API | One JSON log line per request with the allow-listed fields; the auth tests' captured logs contain no password, cookie value, CSRF token or hash | AC-74 |
| HARD-004 | API+DB | 5 failures then the 6th attempt with the correct password → `429` with `Retry-After`; after the window passes (rows updated to an old `windowStart`) login succeeds and the counter resets | AC-75 |
| HARD-005 | API+DB | An unknown email gives the same status sequence; the IP limit triggers at the 21st failure across emails; the counters survive an app restart (new app instance, same DB) | AC-75 |
| HARD-006 | Client | The login page shows the `429` message with minutes rounded up | AC-75 |
| HARD-007 | E2E + axe | NFR-11 screens at 360 px and 1280 px: zero `serious` or `critical` violations | AC-76 |
| HARD-008 | E2E | `npm run test:e2e:all-browsers` passes on Chromium, Firefox and WebKit with zero skips; counts recorded per browser | AC-77 |
| HARD-009 | Release | On the tagged release candidate, all suites and all `PERF-*` scripts pass; SHA and counts recorded | AC-78 |
| HARD-010 | UAT | #66 re-tested by the partner team on the deployed build and closed; defect list shows zero open Major or Critical | AC-79 |
| HARD-011 | Release | Migrate before deploy; revision, digest, tag and commit match; post-deploy journeys for Sprint 1 and F-07–F-12 pass; persistence check | AC-80 |
| HARD-012 | Ops | Backups on (retention ≥ 7 days); rollback rehearsal timed ≤ 10 minutes; README and `deployment.md` current; clean-checkout setup works | AC-81, AC-82 |

## 5. Execution results

No Sprint 3 test has been executed yet. Results will be added here with commit SHAs: F-11 RED, F-11 GREEN, then F-12 and F-13.

## 6. Revision history

| Version | Date | Section | Previous text | Change |
|---|---|---|---|---|
| 1.0 | 2026-11-28 | All | — | First version. |
