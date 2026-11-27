# F-08 Evidence Notes for the Deliverable 2 PDF

| Item | Value |
|---|---|
| Contract commit | `7e42e1f` |
| TDD red commit | `f6a4183` (red run: server 1/41 passed (constant only), client 0/14, E2E 0/3) |
| Implementation commits | migration `effd1e8`, service and routes `34605a9`, E2E selector fix `3714852`, client `37fd6c0` |
| First fully green commit | `37fd6c0` (server 202/202, client 105/105, E2E Chromium 18/18) |
| Raw output | [f08-red-run.txt](./f08-red-run.txt), [f08-green-run.txt](./f08-green-run.txt), [perf-s2-002.txt](./perf-s2-002.txt) |
| Tested version | local build of `37fd6c0` (the footer shows "Release v1.1", the version string of the base release; F-08 is not yet released) |

## Excerpt 1: recovery rule and cross-feature FIFO (NOSHOW-006)

`server/tests/f08-no-show-recovery.test.ts`: A, B, C join; A is called and marked no-show; B is called; then A is returned. A keeps its number and join time, C now has one person ahead, and Call Next calls A before C.

```ts
const res = await recover(operator1, a.id);
expect(res.status).toBe(200);
expect(body).toMatchObject({ id: a.id, status: 'WAITING', queueNumber: a.queueNumber, joinedAt: a.joinedAt, calledAt: null, noShowCount: 1 });
expect(await aheadCount(customer3, c.id)).toBe(1);
await calledNext(operator1, a.id);
await calledNext(operator1, c.id);
```

Result: passed at `37fd6c0` (`f08-green-run.txt`).

## Excerpt 2: access restriction and recovery limit (NOSHOW-004/005, NOSHOW-007)

For both `/no-show` and `/recover`, the same eight callers are checked and the row must be unchanged after each: unassigned operator `403`, the owning customer `403`, another customer `403`, no session `401`, missing or wrong CSRF `403`, malformed id `400`, unknown id `404`. A second return after a second no-show gives `409 RECOVERY_LIMIT_REACHED`, and the database `CHECK` keeps `noShowCount` in 0–2 (NOSHOW-008).

Result: passed at `37fd6c0`.

## Screenshots created by the E2E run (Chromium, commit `37fd6c0`, local test database)

| File | AC | Role | Preconditions | Steps | Expected | Actual |
|---|---|---|---|---|---|---|
| `f08-01-called-with-no-show-button.png` | AC-33 | OPERATOR (operator1) | DB reset; customer1 (#1) and customer2 (#2) joined | Call Next | #1 Called with a Mark no-show button | as expected (NOSHOW-017 passed) |
| `f08-02-no-show-section.png` | AC-25, AC-33 | OPERATOR | #1 Called | Mark no-show | #1 in the No-show section with "Missed:" time and Return to queue; No-show count 1; DB `NO_SHOW`, count 1 | as expected |
| `f08-03-returned-to-queue.png` | AC-28, AC-33 | OPERATOR | #1 No-show, #2 Called | Return to queue | #1 back in the Waiting Queue at position #1 with "Returned to queue:"; DB `WAITING`, `calledAt` null | as expected |
| `f08-04-second-no-show-final.png` | AC-29, AC-33 | OPERATOR | #1 returned once | Call Next → Mark no-show | #1 shows "Already returned once. This entry cannot be returned again." and no button; DB count 2; API recover returns 409 | as expected |
| `f08-05-customer-no-show.png` | AC-34 | CUSTOMER (customer1; operator1 acts by API) | #1 called and marked no-show | open the entry detail page | No-show badge, "Missed:" time, the "You missed your turn..." message, no Leave queue button | as expected (NOSHOW-018 passed) |
| `f08-06-customer-returned.png` | AC-34 | CUSTOMER | operator1 returned #1 by API | Refresh | Waiting, "Returned to queue:" time, Leave queue button | as expected |
| `f08-07-operator-360.png`, `f08-07-operator-1280.png` | AC-33 (NFR-06) | OPERATOR | entries in Waiting and No-show | open the page at 360 × 800 and 1280 × 800 | no horizontal overflow | as expected (NOSHOW-019 passed) |

## Screenshots you must capture manually

These need the deployed app (or a running local app) and a person at the browser or terminal:

1. **AC-25 / AC-33 on the release build:** operator1 calls a customer and marks no-show on the deployed Cloud Run URL; capture the No-show section. Record the version from `/api/health`.
2. **AC-28 on the release build:** Return to queue; capture the entry back at the top of the Waiting Queue, then Call Next calling it.
3. **AC-29 on the release build:** after a second no-show, capture "Already returned once" and, with curl or the browser dev tools, the `409 RECOVERY_LIMIT_REACHED` response of a recover request.
4. **AC-27 API evidence:** a curl or test-output capture of a customer → `403 FORBIDDEN` on `/no-show`. The green-run output already lists NOSHOW-004 and NOSHOW-005 as passed, which can be used instead.
5. **AC-34 on the release build:** the customer's entry page showing No-show and the message.
