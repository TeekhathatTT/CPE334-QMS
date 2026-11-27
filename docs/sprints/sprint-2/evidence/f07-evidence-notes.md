# F-07 Evidence Notes for the Deliverable 2 PDF

| Item | Value |
|---|---|
| Contract commit | `f98c296` |
| TDD red commit | `477febb` (red run: server 0/21, client 4/14 (absence checks), E2E 0/3 passed) |
| First fully green commit | `61e9daf` (server 161/161, client 91/91, E2E Chromium 15/15) |
| Raw output | [f07-red-run.txt](./f07-red-run.txt), [f07-green-run.txt](./f07-green-run.txt) |
| Tested version | local build of `61e9daf` (footer shows "Release v1.1", the version string of the base release; F-07 is not yet released) |

## Excerpt 1: domain / cross-feature rule (rejoin after cancel, race with Call Next)

From `server/tests/f07-customer-cancellation.test.ts`:

```ts
it('CANCEL-010 (AC-21): after cancelling, the customer rejoins the same queue with a new, larger number', async () => {
  const first = await joinedId(customer1);
  expect((await cancel(customer1, first.id)).status).toBe(200);

  const rejoin = await join(customer1);

  expect(rejoin.status).toBe(201);
  const second = rejoin.body.data.entry;
  expect(second.id).not.toBe(first.id);
  expect(second.status).toBe('WAITING');
  expect(second.queueNumber).toBeGreaterThan(first.queueNumber);
  const old = await row(first.id);
  expect(old?.status).toBe('CANCELLED');
  expect(Number(old?.queueNumber)).toBe(first.queueNumber);
});
```

```ts
// CANCEL-014 (AC-23), per round: cancel and Call Next fired in parallel at the only WAITING entry
const [c, n] = await Promise.all([
  cancel(customer1, entry.id),
  operatorPost(operator1, `/api/operator/queues/${OPEN_QUEUE_ID}/call-next`),
]);
if (c.status === 200) {        // cancel won
  expect(n.status).toBe(204);  // Call Next never claims the cancelled row
  expect(stored?.status).toBe('CANCELLED');
  expect(stored?.calledAt).toBeNull();
} else {                       // Call Next won
  expect(c.status).toBe(409);
  expect(stored?.status).toBe('CALLED');
  expect(stored?.cancelledAt).toBeNull();
}
```

## Excerpt 2: access restriction (non-owner 404, operator 403, entry unchanged)

```ts
it('CANCEL-004 (AC-19): a non-owner customer gets the same 404 as an unknown id, and the entry is unchanged', async () => {
  const entry = await joinedId(customer1);
  const before = await row(entry.id);
  const res = await cancel(customer2, entry.id);
  const unknown = await cancel(customer2, UNKNOWN_V4);
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  expect(withoutRequestId(res.body)).toEqual(withoutRequestId(unknown.body));
  expect(await row(entry.id)).toEqual(before);
  // The 404 is about ownership, not a missing route: the owner can cancel the same entry.
  expect((await cancel(customer1, entry.id)).status).toBe(200);
});

it('CANCEL-005 (AC-19): an operator (assigned or not) gets 403 FORBIDDEN, and the entry is unchanged', async () => {
  const entry = await joinedId(customer1);
  const before = await row(entry.id);
  for (const op of [operator1, operator2]) {
    const res = await cancel(op, entry.id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  }
  expect(await row(entry.id)).toEqual(before);
});
```

## Screenshots created by the E2E run (Chromium, commit `61e9daf`, local test database)

| File | AC | Role | Preconditions | Steps | Expected | Actual |
|---|---|---|---|---|---|---|
| `f07-01-waiting-with-leave-button.png` | AC-24 | CUSTOMER (customer1) | DB reset; customer1 joined General Inquiry Desk (#1) | open the entry detail page | WAITING entry shows a Leave queue button | as expected (CANCEL-017 passed) |
| `f07-02-confirmation.png` | AC-24 | CUSTOMER | as above | select Leave queue | confirmation panel, no request sent yet | as expected |
| `f07-03-cancelled.png` | AC-17, AC-24 | CUSTOMER | as above | Yes, leave queue | status Cancelled, "Cancelled:" time equal to DB `cancelledAt`, no Leave queue button | as expected |
| `f07-04-cancelled-after-reload.png` | AC-17 | CUSTOMER | entry cancelled | reload the page | still Cancelled with the same time (persistence) | as expected |
| `f07-05-rejoined-new-number.png` | AC-21 | CUSTOMER | entry #1 cancelled | Back to my queues → Join | new queue number 2 | as expected |
| `f07-06-called-no-leave-button.png` | AC-18, AC-24 | CUSTOMER (operator1 acts by API) | customer1 WAITING; operator1 calls next | Refresh | status Called, no Leave queue button; API cancel returns 409 | as expected (CANCEL-018 passed) |
| `f07-07-confirmation-360.png`, `f07-07-confirmation-1280.png` | AC-24 (NFR-06) | CUSTOMER | WAITING entry | open the confirmation at 360 × 800 and 1280 × 800 | no horizontal overflow | as expected (CANCEL-019 passed) |

## Screenshots you must capture manually

These need the deployed or a running local app and a person at the browser or terminal:

1. **AC-17 on the release build:** customer cancels a WAITING entry on the deployed Cloud Run URL (role CUSTOMER; precondition: joined; steps: details → Leave queue → Yes; expected: Cancelled with time). Record the version from `/api/health`.
2. **AC-17 persistence on the release build:** reload the same page, or sign out and in again; still Cancelled.
3. **AC-18 rejection on a CALLED entry (409):** after operator1 calls the entry, send the cancel request (curl or the browser dev tools) and capture the `409 INVALID_STATE_TRANSITION` response.
4. **AC-19 API evidence:** a curl or test-output capture of operator → `403 FORBIDDEN` and customer2 on customer1's entry → `404 RESOURCE_NOT_FOUND`. The green-run output already lists CANCEL-004 and CANCEL-005 as passed, which can be used instead.
