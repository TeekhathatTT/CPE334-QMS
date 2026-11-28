# F-10 Evidence Notes for the Deliverable 2 PDF

| Item | Value |
|---|---|
| Issue | #43 F-10 Priority queue policy (author `@Khwanklao`, reviewer `@TeekhathatTT`) |
| Contract | Contract v1.1 / SRS v5.1 merged to `sprint2-staging` in PR #67 (`4b93e72`, approved by `@TeekhathatTT`) |
| TDD red commit | `c99236b` (`test(f10): add failing TDD tests for priority queue policy (RED) (#43)`). Server F-10 run: 2 failed files (`f10-priority-rule.test.ts` missing `priorityPolicy`; `f10-priority-queue.test.ts` 12/12 failed). Client full run: 8/8 existing files (127/127 tests) passed, `f10-priorityQueue.test.tsx` 11/11 failed. See [tests.md §9.5](../tests.md#95-execution-results-f-10). |
| TDD green commit | `a286f9b` (`feat(f10): implement priority queue policy (TDD GREEN) (#43)`) on `feature/sprint2/43-priority-queue-policy-impl` |
| Green run | at `a286f9b`: server 20/20 files (280/280 tests), client 9/9 files (138/138 tests), E2E Chromium 25/25, `PERF-S2-004` 4/4 PASS, server typecheck + build ok, client `tsc && vite build` ok |
| Raw output | [f10-red-run.txt](./f10-red-run.txt), [f10-green-run.txt](./f10-green-run.txt), [perf-s2-004.txt](./perf-s2-004.txt) |
| Tested version | local build of `a286f9b` (pending PR review into `sprint2-staging`, merge to `main`, and Cloud Run release). The footer displays `"Release v1.1"`, which is the base release label until the Sprint 2 release. |

## Excerpt 1: priority-aware multi-counter concurrency and `SKIP LOCKED` races (PRIO-010, PRIO-011, AC-51)

`server/tests/f10-priority-queue.test.ts`:
- `PRIO-010` (15 rounds): with 1 earlier `NORMAL` entry (`N1`) and 2 later `PRIORITY` entries (`P1`, `P2`), parallel Call Next on Counter 1 and Counter 2 always returns `[200, 200]`, claims two distinct entries `{P1, P2}` ahead of `N1`, and leaves `N1` `WAITING` with zero double-claims or deadlocks.
- `PRIO-011` (15 rounds counter Call Next, 5 rounds legacy Call Next, 15 rounds F-07 cancel): parallel `PATCH .../priority` vs Call Next produces zero deadlocks and always lands in one of the three deterministic `FOR UPDATE SKIP LOCKED` states (Contract §7.3(a)–(c)); parallel `PATCH .../priority` vs customer `cancel` always commits cleanly with zero priority mutation after `CANCELLED`.

```ts
const [r1, r2] = await Promise.all([
  counterCallNext(operator1, COUNTER_Q1_1),
  counterCallNext(operator1, COUNTER_Q1_2),
]);
expect(r1.status).toBe(200);
expect(r2.status).toBe(200);
expect(new Set([r1.body.data.entry.id, r2.body.data.entry.id])).toEqual(new Set([p1.id, p2.id]));
expect((await entryRowWithPriority(n1.id))?.status).toBe('WAITING');
```

Result: failed at red `c99236b` (`404` route missing / `42703` missing `"priority"` column). Passed at green `a286f9b` ([f10-green-run.txt](./f10-green-run.txt)).

## Excerpt 2: access control, CSRF, and customer anti-self-elevation before DB lookups (PRIO-008, PRIO-009, AC-50)

| Endpoint | Caller / payload | Expected & observed result (`a286f9b`) |
|---|---|---|
| `PATCH /api/operator/queue-entries/:entryId/priority` | No session | `401 UNAUTHORIZED` |
| `PATCH /api/operator/queue-entries/:entryId/priority` | Entry owner (`CUSTOMER`), other `CUSTOMER`, unassigned `OPERATOR`, missing or wrong `X-CSRF-Token` | `403 FORBIDDEN` (entry unchanged in DB) |
| `PATCH /api/operator/queue-entries/:entryId/priority` | Malformed UUID or invalid/extra body keys | `400 INVALID_ARGUMENT` |
| `PATCH /api/operator/queue-entries/:entryId/priority` | Unknown valid UUIDv4 | `404 RESOURCE_NOT_FOUND` |
| `POST /api/queues/:queueId/entries` | `CUSTOMER` sending `{"priority":"PRIORITY"}` against `OPEN`, `CLOSED`, or unknown UUIDv4 queue | `403 FORBIDDEN` before DB lookups (zero rows inserted, `lastQueueNumber` unchanged) |
| `POST /api/queues/:queueId/entries` | `CUSTOMER` sending invalid `priority` (`"HIGH"`, `null`, `123`, `""`) against `OPEN`, `CLOSED`, or unknown UUIDv4 queue | `400 INVALID_ARGUMENT` before DB lookups |
| `POST /api/queues/:queueId/entries` | `CUSTOMER` sending empty body or literal `{"priority":"NORMAL"}` against `OPEN` queue | `201 Created` (`priority: "NORMAL"`) |

## Regression scoping note (`REG-S2-004`)

All 245 existing server tests and all 22 existing Playwright E2E tests passed **unmodified** at `a286f9b`. In the client unit suite, 126/127 existing tests passed unmodified; 1 line in existing F-08 test `client/src/test/f08-noShow.test.tsx` (line 106, `NOSHOW-015`) was scoped from `queryByRole('button')` to `queryByRole('button', { name: /no-show|return/i })` because F-10 intentionally renders the `Set Priority` toggle button on `WAITING` entries (matching line 105's scoping on `SERVING` cards). Zero F-10 RED test assertions (`PRIO-001`–`PRIO-018`) were modified.

## Screenshots created by the E2E run (manual-equivalent UI flow automated in Playwright, Chromium, commit `a286f9b`, local test database, 2026-11-28)

| File | AC | Role | Preconditions | Steps | Expected | Actual |
|---|---|---|---|---|---|---|
| `f10-01-operator-waiting-priority.png` | AC-46, AC-47, AC-48, AC-54 | OPERATOR (`operator1`) | DB reset; `customer1` (#1) then `customer2` (#2) joined General Inquiry Desk (`WAITING`, `NORMAL`) | Operator opens `/operator/queues/:id` and clicks **Set Priority** on #2 | Live status banner `"Queue number 2 priority set to Priority."`; #2 moves ahead of #1 in Waiting Queue with `Priority` badge (star icon + text) and button label **Set Normal**; #1 stays `NORMAL` with **Set Priority**; persisted in DB (`WAITING`, `PRIORITY`) across reload | as expected (`PRIO-016` passed at `a286f9b`) |
| `f10-02-customer-priority-called.png` | AC-47, AC-55 | CUSTOMER (`customer2`) | Operator clicked **Call next customer to Counter 1**, claiming priority #2 ahead of earlier #1 | `customer2` signs in and opens `/customer/entries/:id` for #2 | Status `Called`, read-only `Priority` badge (text + icon), `Counter 1` badge, prompt `"Please proceed to Counter 1."`, and zero priority edit/toggle buttons | as expected (`PRIO-016` passed at `a286f9b`) |
| `f10-03-operator-360.png`, `f10-03-operator-1280.png` | AC-54 | OPERATOR (`operator1`) | `customer1` joined General Inquiry Desk; operator toggled priority using keyboard only (`Tab`/focus + `Enter`) | Viewport resized to `360 × 800` and `1280 × 800` on `/operator/queues/:id` | Priority badge and **Set Normal** button stack/align cleanly with zero page-level horizontal overflow (`scrollWidth <= clientWidth`) at both widths | as expected (`PRIO-018` passed at `a286f9b`) |
| `f10-04-customer-360.png`, `f10-04-customer-1280.png` | AC-55 | CUSTOMER (`customer1`) | `customer1`'s `WAITING` entry promoted to `PRIORITY` | `customer1` opens `/customer` and `/customer/entries/:id` at `360 × 800` and `1280 × 800` | Read-only `Priority` badge and waiting helper note `"Queue position may adjust when priority customers are accommodated."` readable with zero page-level horizontal overflow at both widths | as expected (`PRIO-018` passed at `a286f9b`) |

Negative and cross-feature UI paths asserted in E2E without a dedicated screenshot:
- `PRIO-017`: promoted `PRIORITY` entry called at Counter 1 (confirming zero priority toggle on `CALLED` card) → marked `NO_SHOW` (confirming `Priority` badge retained and zero toggle on `NO_SHOW` card) → returned to queue via F-08 recovery (confirming `Priority` badge preserved) → re-called at Counter 2 ahead of earlier `NORMAL` entry; stale `Set Priority` click after out-of-band API Call Next renders `role="alert"` `"This entry is no longer waiting, so its priority cannot be changed."` and refreshes the entry list.

Not shown here: Firefox/WebKit E2E; `docker build` on the F-10 branch; Cloud SQL migration and Cloud Run deployment (handled at Sprint 2 release).
