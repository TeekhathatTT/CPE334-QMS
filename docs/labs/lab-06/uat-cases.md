# QMS Sprint 1: User Acceptance Test (UAT) Cases

Lab 6 Part A, Issue #25. These cases are for an independent UAT team testing the deployed QMS release from a web browser. Read [handoff.md](./handoff.md) first: it gives the environment, the accounts and how to report a defect.

## How to read these cases

- **Sources.** Every reference comes from the repository documents: requirements and business rules from [`docs/srs.md`](../../srs.md), the AC-to-test mapping from [`docs/traceability.md`](../../traceability.md), screen behavior from [`ui-spec.md`](../../sprints/sprint-1/ui-spec.md), the API contract from [`api-spec.md`](../../sprints/sprint-1/api-spec.md), and test IDs from [`tests.md`](../../sprints/sprint-1/tests.md). Screen text in quotes is the exact text the Sprint 1 client shows (from `client/src`).
- **AC IDs.** The repository lists AC-01 to AC-16 only as references next to each FR in the SRS and in the traceability tables. No document gives the wording of each AC. Each case therefore cites the ACs that the SRS links to the FRs it exercises (see Open questions).
- **Accounts.** Accounts are named by label (`customer1`, `customer2`, `operator1`, `operator2`). The sign-in details for each label are sent to the UAT team privately and are not in this repository.
- **Two browsers at once.** Several cases need a customer and an operator signed in at the same time. Use two separate browser profiles, or one normal window and one private window, so the two sessions do not share cookies.
- **Queue numbers.** Queue numbers never reset in Sprint 1 (BR-04), and other testers may have used the queue before you. Do not expect a particular number such as `1`. Write down the number you get and check it in later steps.
- **Status refresh.** The customer pages re-check the status automatically every 10 seconds while the page is visible. Wait up to 15 seconds, or press **Refresh**, before you record a status as wrong (see handoff.md, Known limitations).
- **Base URL.** `<BASE_URL>` below means the service URL in handoff.md §2 (`TO FILL (Cloud Run URL from Lab 5)`).

## UAT-01: Customer joins a queue and follows it to completion

| Field | Value |
|---|---|
| Covers | AC-01, AC-06, AC-07, AC-08, AC-10, AC-11, AC-12, AC-14, AC-15 · FR-01, FR-04, FR-05, FR-07, FR-08, FR-09, FR-10, FR-11, FR-13 · BR-08, BR-09, BR-11 · related tests FLOW-009, FLOW-010, QUEUE-002, FLOW-002, FLOW-004, FLOW-006 |
| Purpose | Confirm the main Sprint 1 journey: a customer gets a queue number and sees each status change as the assigned operator calls, starts and completes service. |
| Role(s) | CUSTOMER (`customer1`) and OPERATOR (`operator1`) |
| Interface | UI only |

**Preconditions**
1. The seeded queue "General Inquiry Desk" is open, and `operator1` is assigned to it.
2. `customer1` has no Waiting, Called or In service ticket for "General Inquiry Desk" (check **My Active Tickets**; Completed tickets are fine).
3. No other customer is waiting in "General Inquiry Desk": signed in as `operator1`, the queue page shows "No customers are currently waiting in this queue." and "No entries are currently called or in service." If not, coordinate with the other testers (handoff.md §3) before you start, because Call Next always takes the oldest waiting customer.

**Synthetic input:** seeded accounts `customer1` and `operator1`; seeded queue "General Inquiry Desk". No other data is typed in.

**Steps**
1. Window A: open `<BASE_URL>/login` and sign in as `customer1`.
2. On the **Available Queues** tab, find "General Inquiry Desk" and select **Join Queue**.
3. Select **View details** in the success panel. Keep this detail page open in Window A.
4. Window B: open `<BASE_URL>/login` and sign in as `operator1`.
5. On "Assigned queues", select **Manage queue** for "General Inquiry Desk".
6. Select **Call Next**.
7. Window A: wait up to 15 seconds without reloading, then record the status.
8. Window B: select **Start Service** on the entry in "Active Service".
9. Window A: wait up to 15 seconds, then record the status.
10. Window B: select **Complete Service** on the same entry.
11. Window A: wait up to 15 seconds, then record the status.

**Expected results**
1. Step 1: the browser goes to `/customer` and shows the tabs **Available Queues** and **My Active Tickets**.
2. Step 2: "General Inquiry Desk" is listed with availability "Open"; "Specialized Consultation" is not listed. While the request runs, the button shows "Joining queue..." and is disabled. Then a panel shows "You joined General Inquiry Desk.", the queue name, a positive whole number under "Queue number", and the status "Waiting". Record the number as **N**.
3. Step 3: the page heading is "Queue entry". It shows queue number **N**, "General Inquiry Desk", "Status:" Waiting, the message "You are next", a "Joined:" time, and the line "Status updates automatically every 10 seconds."
4. Step 5: the "Waiting Queue — FIFO (1)" section lists queue number **N** at position #1 with status Waiting and a "Customer ID:" value. No customer email or name is shown.
5. Step 6: the button shows "Calling next..." while pending. Then the banner shows "Called queue number N." Entry **N** moves to "Active Service (1)" with status Called; **Start Service** is enabled and **Complete Service** is disabled.
6. Step 7: without a page reload, the customer page shows status Called, the message "Please go to the service desk.", and a "Called:" time.
7. Step 8: the banner shows "Started service for queue number N." The entry shows status In service; **Start Service** is disabled and **Complete Service** is enabled.
8. Step 9: the customer page shows status In service, the message "Your service is in progress.", and a "Service started:" time.
9. Step 10: the banner shows "Completed service for queue number N." Entry **N** appears under "Completed (…)" with status Completed, and "Active Service (0)" shows "No entries are currently called or in service."
10. Step 11: the customer page shows status Completed, the message "Service completed.", a "Completed:" time, and the line "This entry is complete and no longer updates."
11. At no step does any page show a stack trace, SQL text or another customer's data.

**Pass / Fail / Notes:** ☐ Pass ☐ Fail · Notes: ____________________ · Tester / date / browser: ____________

## UAT-02: Duplicate active join in the same queue is refused

| Field | Value |
|---|---|
| Covers | AC-07, AC-16 · FR-05, FR-12 · BR-05 · related tests QUEUE-003, CONCURRENCY-002 (server side) |
| Purpose | Confirm that a customer cannot hold two active tickets in the same queue and gets a clear message. |
| Role(s) | CUSTOMER (`customer1`) |
| Interface | UI only |

**Preconditions**
1. "General Inquiry Desk" is open.
2. `customer1` has no active (Waiting, Called or In service) ticket for "General Inquiry Desk".

**Synthetic input:** seeded account `customer1`; seeded queue "General Inquiry Desk".

**Steps**
1. Sign in as `customer1`.
2. On **Available Queues**, select **Join Queue** on "General Inquiry Desk". Record the queue number as **N**.
3. Select **Join Queue** on "General Inquiry Desk" a second time.
4. Open the **My Active Tickets** tab.

**Expected results**
1. Step 2: the panel shows "You joined General Inquiry Desk.", queue number **N** and status Waiting.
2. Step 3: an error message shows "You already have an active entry in this queue." The **Join Queue** button is enabled again after the request finishes. No new queue number is shown.
3. Step 4: exactly one ticket for "General Inquiry Desk" has status Waiting, and it has queue number **N**. (Completed tickets from earlier runs may also be listed; they do not count.)

**Clean-up:** ask `operator1` to call, start and complete ticket **N** (as in UAT-01, steps 5–10), so the next tester starts from an empty queue.

**Pass / Fail / Notes:** ☐ Pass ☐ Fail · Notes: ____________________ · Tester / date / browser: ____________

## UAT-03: A closed queue cannot be joined

| Field | Value |
|---|---|
| Covers | AC-06, AC-07, AC-16 · FR-04, FR-12 · BR-08 · related tests QUEUE-001, QUEUE-004 |
| Purpose | Confirm that the closed seeded queue is hidden from customers and that a direct join attempt is refused. |
| Role(s) | CUSTOMER (`customer1`) |
| Interface | UI (steps 1–3); API from the browser developer console (steps 4–6, optional) |

**Preconditions**
1. The seeded queue "Specialized Consultation" is CLOSED (its seeded state). Its id is `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` (from `server/prisma/seed.ts`).
2. Steps 4–6 only: the tester can open the browser developer tools console.

**Synthetic input:** seeded account `customer1`; the seeded queue id above.

**Steps**
1. Sign in as `customer1`.
2. Look at every queue card on **Available Queues**.
3. Open **My Active Tickets** and note how many tickets are listed.
4. (Optional, API) In the same tab, open the developer tools console and run:

   ```js
   const csrf = decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('qms_csrf=')).split('=')[1]);
   const r = await fetch('/api/queues/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/entries', { method: 'POST', headers: { 'X-CSRF-Token': csrf } });
   console.log(r.status, await r.json());
   ```

5. (Optional, API) Note the status and body printed.
6. (Optional) Reload the page and open **My Active Tickets** again.

**Expected results**
1. Step 2: "General Inquiry Desk" is listed; "Specialized Consultation" is not listed anywhere on the page.
2. Step 5: the console prints `409` and a body whose `error.code` is `QUEUE_NOT_AVAILABLE`, with a `message` and a `requestId`. No `data` field and no internal details (stack trace, SQL) are returned.
3. Step 6: the number of tickets is the same as in step 3; there is no ticket for "Specialized Consultation".

**Note:** The UI cannot reach the closed-queue message ("This queue is not available right now.") from the browser alone, because a closed queue is never listed. That message appears only if a queue closes while the customer has the list open, and Sprint 1 has no screen for closing a queue.

**Pass / Fail / Notes:** ☐ Pass ☐ Fail · Notes: ____________________ · Tester / date / browser: ____________

## UAT-04: First in, first out, and Call Next on an empty queue

| Field | Value |
|---|---|
| Covers | AC-04, AC-11, AC-12, AC-13 · FR-08, FR-09 · BR-01, BR-02, BR-10 · related tests QUEUE-007, FLOW-001, FLOW-003, NUMBER-001 |
| Purpose | Confirm that the operator serves customers in the order they joined and that Call Next on an empty queue shows a neutral message and changes nothing. |
| Role(s) | CUSTOMER (`customer1`, `customer2`) and OPERATOR (`operator1`) |
| Interface | UI only |

**Preconditions**
1. Same as UAT-01 preconditions 1 and 3 (no one waiting, nothing called or in service in "General Inquiry Desk").
2. Neither `customer1` nor `customer2` has an active ticket for "General Inquiry Desk".

**Synthetic input:** seeded accounts `customer1`, `customer2`, `operator1`; seeded queue "General Inquiry Desk".

**Steps**
1. Window A: sign in as `customer1` and join "General Inquiry Desk". Record the number as **N1**.
2. Window B: sign in as `customer2` and join "General Inquiry Desk". Record the number as **N2**.
3. Window C: sign in as `operator1`, select **Manage queue** for "General Inquiry Desk", and read the "Waiting Queue — FIFO" section.
4. Window C: select **Call Next**.
5. Window C: select **Start Service**, then **Complete Service**, on the entry in "Active Service".
6. Window C: select **Call Next**, then **Start Service** and **Complete Service** on the new entry.
7. Window C: note the counts on the page, then select **Call Next** once more.

**Expected results**
1. Steps 1–2: **N1** and **N2** are positive whole numbers and **N2** is greater than **N1**. (If no one else joined in between, **N2** is **N1** + 1.)
2. Step 3: "Waiting Queue — FIFO (2)" lists **N1** at position #1 and **N2** at position #2. The "Customer ID:" values differ between the two rows.
3. Step 4: the banner shows "Called queue number N1." (not N2). **N2** is still listed as Waiting at position #1.
4. Step 6: the banner shows "Called queue number N2."
5. Step 7: the banner shows "No waiting entries to call right now." The "Waiting", "Active" and "Completed" counts at the top of the page are the same as before the click, and **N1** and **N2** are still listed under "Completed (…)" with status Completed.
6. Window B (`customer2`) shows status Completed for ticket **N2** after a refresh.

**Pass / Fail / Notes:** ☐ Pass ☐ Fail · Notes: ____________________ · Tester / date / browser: ____________

## UAT-05: A customer cannot use operator screens or another customer's ticket

| Field | Value |
|---|---|
| Covers | AC-03, AC-05, AC-10 · FR-03, FR-07 · BR-07 · related tests RBAC-005, QUEUE-006 (E2E scenarios S6 and S8 in tests.md §13.4) |
| Purpose | Confirm role separation and customer privacy from the browser. |
| Role(s) | CUSTOMER (`customer1`, `customer2`), OPERATOR (`operator1`) |
| Interface | UI only |

**Preconditions**
1. `customer1` has at least one ticket in **My Active Tickets** (any status). If not, join "General Inquiry Desk" first.
2. Two separate browser sessions (handoff.md, "Two browsers at once").

**Synthetic input:** seeded accounts; the address of one of `customer1`'s ticket detail pages; the seeded queue id `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` ("General Inquiry Desk").

**Steps**
1. Window A: sign in as `customer1`, open **My Active Tickets**, select **View details** on a ticket, and copy the full address from the address bar (it has the form `<BASE_URL>/customer/entries/<id>`). Record the queue number shown.
2. Window A: type `<BASE_URL>/operator` in the address bar and press Enter.
3. Window A: type `<BASE_URL>/operator/queues/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` and press Enter.
4. Window B: sign in as `customer2`, then paste the address copied in step 1 and press Enter.
5. Window B: sign out (**Logout**). Sign in as `operator1`, then type `<BASE_URL>/customer` and press Enter.

**Expected results**
1. Steps 2 and 3: the browser ends on `/customer` (the customer's own screen). No "Call Next", "Start Service" or "Complete Service" button and no operator queue data appear at any point. (The spec does not say what message a wrong-role user should see; see handoff.md, Known limitations.)
2. Step 4: the page heading is "Queue entry" and the only content is "We couldn't find that queue entry." No queue number, status, timestamps, customer ID or email of `customer1` is shown.
3. Step 5: the browser ends on `/operator` (the "Assigned queues" screen). No **Join Queue** button and no customer ticket list appear.

**Pass / Fail / Notes:** ☐ Pass ☐ Fail · Notes: ____________________ · Tester / date / browser: ____________

## UAT-06: An operator not assigned to the queue cannot work it

| Field | Value |
|---|---|
| Covers | AC-04, AC-05 · FR-03, FR-08 · BR-07 · related test RBAC-004 (E2E scenario S3 in tests.md §13.4) |
| Purpose | Confirm that an operator sees and acts only on queues assigned to them. |
| Role(s) | OPERATOR (`operator2`, unassigned) |
| Interface | UI only |

**Preconditions**
1. `operator2` has no queue assignment (seeded state).
2. Preferably at least one customer is waiting in "General Inquiry Desk", so the test shows that no customer data leaks.

**Synthetic input:** seeded account `operator2`; seeded queue id `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`.

**Steps**
1. Sign in as `operator2`.
2. Read the "Assigned queues" screen.
3. Type `<BASE_URL>/operator/queues/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` in the address bar and press Enter.

**Expected results**
1. Step 2: the screen shows "You have no assigned service queues." and no **Manage queue** link.
2. Step 3: the page shows "You do not have permission to manage this queue." There is no **Call Next** button, no "Waiting Queue — FIFO" section, and no queue number or "Customer ID:" value.
3. Afterwards, `operator1` still sees the same waiting entries as before (nothing was changed by `operator2`).

**Pass / Fail / Notes:** ☐ Pass ☐ Fail · Notes: ____________________ · Tester / date / browser: ____________

## UAT-07: Data and history survive a refresh and a new sign-in; a completed ticket can be followed by a new one

| Field | Value |
|---|---|
| Covers | AC-08, AC-15 · FR-05, FR-11, FR-13 · BR-04, BR-05 · NFR-05 · related tests QUEUE-005, NUMBER-001, REL-001 |
| Purpose | Confirm that queue data is stored by the server, completed tickets stay in the customer's history, and a customer may join again after completion. |
| Role(s) | CUSTOMER (`customer1`), OPERATOR (`operator1`) |
| Interface | UI only |

**Preconditions**
1. UAT-01 has just been run (or repeat it): `customer1` has a Completed ticket **N** in "General Inquiry Desk" and no active ticket there.

**Synthetic input:** seeded accounts `customer1`, `operator1`.

**Steps**
1. As `customer1`, open **My Active Tickets** and press the browser's reload button.
2. Select **Logout**, close the browser window, open a new one, go to `<BASE_URL>/login` and sign in as `customer1` again.
3. Open **My Active Tickets**, then **View details** on ticket **N**.
4. As `operator1`, reload the "General Inquiry Desk" queue page.
5. As `customer1`, go back to **Available Queues** and select **Join Queue** on "General Inquiry Desk". Record the number as **M**.
6. **Variant: restart or redeploy.** `TO FILL (needs deployed environment)`. After the team restarts or redeploys the Cloud Run service (handoff.md §3), repeat steps 2–4.

**Expected results**
1. Step 1: after the reload, ticket **N** is still listed for "General Inquiry Desk" with status Completed and its "Joined:", "Called:", "Service started:" and "Completed:" times.
2. Step 2: after **Logout**, the browser shows the "Sign in" screen. After signing in again, it shows `/customer`.
3. Step 3: ticket **N** is still in the list with status Completed. The detail page shows "Service completed." and "This entry is complete and no longer updates.", with the same times as in step 1.
4. Step 4: ticket **N** is listed under "Completed (…)" with the same queue number.
5. Step 5: the join succeeds with "You joined General Inquiry Desk." and status Waiting. **M** is greater than **N** (numbers are not reused). **My Active Tickets** now shows both the new Waiting ticket **M** and the Completed ticket **N**.
6. Step 6 (when filled): the same data as steps 1–4 is still shown after the restart or redeploy.

**Clean-up:** ask `operator1` to call, start and complete ticket **M**.

**Pass / Fail / Notes:** ☐ Pass ☐ Fail · Notes: ____________________ · Tester / date / browser: ____________

## UAT-08: Sign-in is refused for a wrong password, and sign-out ends the session

| Field | Value |
|---|---|
| Covers | AC-01, AC-02, AC-03 · FR-01, FR-02 · related tests AUTH-003, AUTH-004 (E2E scenario S7 in tests.md §13.4) |
| Purpose | Confirm that wrong credentials are refused without revealing whether the account exists, and that protected screens need a session. |
| Role(s) | Anonymous, then CUSTOMER (`customer1`) |
| Interface | UI only |

**Preconditions:** the tester is signed out.

**Synthetic input:** the sign-in name of `customer1` with an obviously wrong password, for example `wrong-password-uat`; an obviously fake sign-in name, for example `nobody-uat` at a fake domain such as `example.invalid` (written as name@domain).

**Steps**
1. Open `<BASE_URL>/customer` while signed out.
2. On the "Sign in" screen, select **Sign in** with both fields empty.
3. Enter the `customer1` sign-in name with the wrong password and select **Sign in**.
4. Enter the fake sign-in name with the same wrong password and select **Sign in**.
5. Sign in as `customer1` with the correct password, then select **Logout**.
6. Open `<BASE_URL>/customer` again.

**Expected results**
1. Step 1: the browser shows the "Sign in" screen at `/login`, without the "Session expired. Please sign in again." banner.
2. Step 2: the field messages "Email is required." and "Password is required." are shown and no sign-in happens.
3. Steps 3 and 4: both attempts show exactly the same message, "Invalid email or password.", and stay on `/login`. Nothing on the page says whether the account exists.
4. Step 5: sign-in goes to `/customer`; **Logout** returns to the "Sign in" screen.
5. Step 6: the browser shows the "Sign in" screen again; no customer data is shown.

**Pass / Fail / Notes:** ☐ Pass ☐ Fail · Notes: ____________________ · Tester / date / browser: ____________

## Coverage table

| Case | AC | FR | BR |
|---|---|---|---|
| UAT-01 | AC-01, AC-06, AC-07, AC-08, AC-10, AC-11, AC-12, AC-14, AC-15 | FR-01, FR-04, FR-05, FR-07, FR-08, FR-09, FR-10, FR-11, FR-13 | BR-08, BR-09, BR-11 |
| UAT-02 | AC-07, AC-16 | FR-05, FR-12 | BR-05 |
| UAT-03 | AC-06, AC-07, AC-16 | FR-04, FR-12 | BR-08 |
| UAT-04 | AC-04, AC-11, AC-12, AC-13 | FR-08, FR-09 | BR-01, BR-02, BR-10 |
| UAT-05 | AC-03, AC-05, AC-10 | FR-03, FR-07 | BR-07 |
| UAT-06 | AC-04, AC-05 | FR-03, FR-08 | BR-07 |
| UAT-07 | AC-08, AC-15 | FR-05, FR-11, FR-13 | BR-04, BR-05 |
| UAT-08 | AC-01, AC-02, AC-03 | FR-01, FR-02 | none |

### Sprint 1 items no case covers

- **AC-09** (concurrency-safe numbering, FR-06, tests NUMBER-002 and CONCURRENCY-001) is not covered. Parallel joins and a rollback cannot be produced or checked from a browser; they are verified only by the team's server tests.
- **AC-16 is only partly covered.** UAT-02 and UAT-03 cover the duplicate-join and closed-queue rejections. Invalid lifecycle transitions (`409 INVALID_STATE_TRANSITION`, FLOW-005, FLOW-007), stale concurrent mutations (`409 CONCURRENT_MODIFICATION`, CONCURRENCY-004) and malformed identifiers (`400 INVALID_ARGUMENT`, API-001) are not covered, because the UI disables actions that are not allowed and there is no browser-only way to send them.
- **AC-12 and AC-13 are covered for one operator only.** Two operators calling the same queue at the same moment (CONCURRENCY-003) is not covered: only one seeded operator is assigned to the open queue.
- **BR-03, BR-06 and BR-12** are not covered. BR-03 and BR-12 are database-level rules (transactions, row locks, constraints). BR-06 (joining several queues at once) cannot be shown, because the seed has only one open queue.
- **Session expiry** (the "Session expired. Please sign in again." banner, AUTH-005) is not covered: it needs a session to expire (8 hours) or to be revoked in the database.
- **Non-functional requirements** NFR-01, NFR-02 (CSRF), NFR-03, NFR-04 and NFR-06 are not covered by these cases. NFR-05 is covered only for the restart variant of UAT-07, which is `TO FILL`.

## Open questions

1. The wording of AC-01 to AC-16 is not written in any repository document; only the IDs appear (SRS §4, traceability.md). The AC mapping above is derived from the FR-to-AC links. The team should confirm it or add the AC text.
2. The browsers the release supports are not stated in the SRS or the UI spec (see handoff.md §2).
3. What a signed-in user should see on the other role's screens is not specified (tests.md §13.8, gap 1). UAT-05 records the current behavior (a silent redirect to the user's own home screen) as the expected result; the spec owner has not confirmed it.
