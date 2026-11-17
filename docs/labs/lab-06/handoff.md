# QMS Sprint 1: UAT Handoff Package

Lab 6 Part A, Issue #25. This package gives an independent UAT team what it needs to run the cases in [uat-cases.md](./uat-cases.md) against the deployed QMS release. Items marked `TO FILL` depend on the Lab 5 deployment and had not been created or checked when this file was written.

## 1. Tested scope and version

### In scope (Sprint 1)

The Sprint 1 features as listed in [`docs/traceability.md`](../../traceability.md) (Feature Inventory Summary) and [`docs/srs.md`](../../srs.md) §1:

| Feature | Title | What the tester can see |
|---|---|---|
| F-01 | Foundation and persistence baseline | Data is stored in PostgreSQL and is still there after a reload or a new sign-in. |
| F-02 | Authentication and RBAC | Sign-in and sign-out for CUSTOMER and OPERATOR; each role only reaches its own screens. |
| F-03 | Queue catalog and number allocation | Customers see only OPEN queues; each join gets a positive queue number unique within the queue. |
| F-04 | Customer queue join and own-state retrieval | Join a queue, see "My Active Tickets" and a ticket detail page; only your own tickets. |
| F-05 | Operator lifecycle management | Assigned operators see the queue in first-in-first-out order and use Call Next, Start Service and Complete Service. |
| F-06 | Integration and regression verification | Cross-cutting verification by the team; not a separate screen. |

### Out of scope (from SRS §1 and AD-03)

Customer self-registration, password reset, cancelling or leaving a queue, no-show handling, multiple counters, priority queues, analytics and appointment booking (features F-07 to F-12 are planned for Sprints 2 and 3). There is also no screen for opening or closing a queue or for assigning operators; those are set by the seed only.

### Version

| Item | Value | How it was checked |
|---|---|---|
| Release tag | `TO FILL (from Lab 5)`: no tag exists in the repository yet. | `git tag` returned nothing (checked 2026-11-17). |
| Current `main` commit | `7edfd9921f72e746004873f84c7e6ed2f48221ef` (`7edfd99`, "Merge pull request #15 from TeekhathatTT/sprint1-staging") | `git log -1 origin/main` after `git fetch` (2026-11-17). |
| Commit actually deployed | `TO FILL (from Lab 5)`: read it from `GET /api/health` once the service runs (see §2). | Not checked: no deployed service yet. |
| Cloud Run revision | `TO FILL (from Lab 5)` | Not checked. |

The deployed build may be newer than `main` above: the Lab 5 work (Issue #17) adds the health endpoint and production serving and was not yet merged to `main` when this was written.

## 2. Environment

| Item | Value |
|---|---|
| Public URL | `TO FILL (Cloud Run URL from Lab 5)` |
| Sign-in page | `<public URL>/login` |
| Supported browsers | Not stated in the SRS or UI spec. The team's own Sprint 1 browser tests ran in Playwright's Chromium, Firefox and WebKit builds on Windows (tests.md §13); real Safari on macOS/iOS and mobile browsers were not tested (tests.md §13.7). `TO FILL`: the browsers the team asks the UAT team to use. |
| Screen sizes | The UI is specified to work without horizontal scrolling at 360 px and 1280 px widths (NFR-06, ui-spec §8.2). |

**Checking which commit is running.** The endpoint `GET /api/health` exists on the Lab 5 branch `feature/lab5/2-cloud-ready-config` (Issue #17, `server/src/routes/health.ts`). It is **not** on `main` or on the branch this file was written on. If the deployed build includes it, open `<public URL>/api/health` in the browser. It needs no sign-in and returns:

- `{"status":"ok","database":"ok","version":"<commit SHA>"}` when the service and database are working;
- HTTP 503 with `{"status":"degraded","database":"unavailable","version":"<commit SHA>"}` when the database cannot be reached.

`version` is the deployed commit SHA, or `unknown` if the deploy did not set it. Record it in every defect report. If the endpoint returns a JSON `404 RESOURCE_NOT_FOUND` error, the deployed build does not include it; ask the team which commit is deployed.

## 3. Data setup and cleanup

### Starting data (from `server/prisma/seed.ts`)

| Queue | Id | Availability | Assigned operator |
|---|---|---|---|
| General Inquiry Desk | `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` | OPEN | `operator1` |
| Specialized Consultation | `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` | CLOSED | none |

The seed creates no queue entries. On a fresh database both queues have `lastQueueNumber` 0, so the first join gets number 1.

### Data the tests create

Each join creates one queue entry (ticket) for the signed-in customer in "General Inquiry Desk". Operator actions change that entry's status (Waiting → Called → In service → Completed). Entries cannot be deleted or cancelled from the application, and completed entries stay in the history by design (FR-13).

### Avoiding interference

- There is **one** open queue, **one** assigned operator and **two** customer accounts, shared by every tester. Call Next always takes the oldest waiting entry in the queue, so two testers running cases at the same time will call each other's customers.
- Run UAT-01, UAT-02, UAT-04 and UAT-07 **one tester at a time**. Agree a time slot inside the UAT team (`TO FILL`: how the UAT team books slots).
- Before each of those cases, check the precondition on the `operator1` queue page: "No customers are currently waiting in this queue." and "No entries are currently called or in service."
- After a case, finish every entry you created (Call Next, Start Service, Complete Service as `operator1`). The cases give the clean-up step.
- Do not expect a particular queue number. Numbers never reset in Sprint 1 (BR-04), so they keep rising across testers and runs.

### Reset

The repository has **no** reset method for application data. `npm run seed` only creates or updates the accounts, the two queues and the assignment; it does not delete queue entries and does not reset the queue-number counter (README, seed step). The only code that deletes all rows is the automated test setup, which runs against the separate test database (`TEST_DATABASE_URL`) and refuses to run when that is missing or equals `DATABASE_URL` (README); it is not a reset tool for the deployed service.

If the shared data gets into a state the testers cannot fix with the operator screens, contact the QMS team (`TO FILL`: contact person and channel). Resetting the deployed database is done by the team, not by the UAT testers.

## 4. Account mapping

| Label | Role | Seeded state | Used in |
|---|---|---|---|
| `customer1` | CUSTOMER | Active | UAT-01, UAT-02, UAT-03, UAT-04, UAT-05, UAT-07, UAT-08: the main customer who joins and follows a ticket |
| `customer2` | CUSTOMER | Active | UAT-04: second customer for first-in-first-out order; UAT-05: tries to open `customer1`'s ticket |
| `operator1` | OPERATOR | Active, assigned to "General Inquiry Desk" | UAT-01, UAT-04, UAT-05, UAT-07: calls, starts and completes service; also used for clean-up |
| `operator2` | OPERATOR | Active, no assigned queue | UAT-06: checks that an unassigned operator cannot see or act on the queue |

Passwords are sent privately to the UAT team and are not stored in this repository. The sign-in name for each label is sent together with its password.

## 5. How to report a defect

For each failed step, record:

| Field | What to write |
|---|---|
| Case and step | For example `UAT-04, step 4` |
| Account and role | The label, for example `operator1` (OPERATOR). Never the password. |
| Time | Date and time with time zone |
| Environment | Browser name and version, screen width, and the `version` value from `/api/health` (§2) |
| Steps | What you did, in order, from the case |
| Expected | The expected result quoted from the case |
| Actual | What you saw, with the exact on-screen text |
| Evidence | A screenshot with the address bar visible. Mask any password, cookie or token before sharing. |
| Request ID | If an API call failed (for example in the browser network tab), the `requestId` from the error body |

**Where to report:** `TO FILL`. The QMS team tracks its own work as GitHub Issues in this repository, but the channel agreed with the UAT team has not been decided. This repository is public: if GitHub Issues are used, a report must not contain passwords, cookies, tokens or personal data.

## 6. Known limitations

These are open gaps already recorded by the team. They are not defects found by UAT unless the behavior differs from what is written here.

From tests.md §13.8 (spec gaps):

1. **Wrong-role navigation is not specified.** A signed-in customer who opens an operator address, or an operator who opens a customer address, is silently sent to their own home screen (`/customer` or `/operator`) with no message. The spec does not say whether a message is required; the spec owner has not confirmed this behavior.
2. **The customer refresh interval is not specified.** The customer screens re-check status every 10 seconds while visible; this is a team decision, not a spec value. A status change can take up to about 10 seconds to appear; the team's tests allow 15 seconds. **Refresh** fetches immediately.
3. **Focus after an action is not specified.** The UI spec requires a visible focus indicator but not where focus goes after Join, Call Next, Start Service or Complete Service. After Join, keyboard focus falls back to the page body (tests.md §11, §13.10).

From tests.md §13.7 (not verified by the team):

4. Real Safari on macOS/iOS and mobile browsers were not tested, and no physical touch device was used. In WebKit, links are not in the Tab order by default, so the team's keyboard-only walkthrough was skipped there (tests.md §13.10).
5. No screen-reader listening test (NVDA, JAWS, VoiceOver, TalkBack) was done; status announcements were checked only in the page markup.
6. Performance was measured only as one sequential run on one local machine (PERF-001), not under concurrent load and not on the deployed service.
7. All Sprint 1 results come from one local Windows machine. Nothing was run in CI or against a deployed environment.

Other limits that affect UAT:

8. A closed queue cannot be joined from the UI because it is never listed, and there is no screen to open or close a queue (see UAT-03).
9. Session expiry (8 hours) cannot be reached in a normal UAT session.
