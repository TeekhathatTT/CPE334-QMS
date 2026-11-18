# QMS Sprint 1: UAT Handoff Package

Lab 6 Part A, Issue #25. This package gives an independent UAT team what it needs to run the cases in [uat-cases.md](./uat-cases.md) on a copy of QMS that the owner runs on their own machine. No cloud deployment exists for this project, so this handoff covers local testing only. Items marked `TO FILL` are decided or created at test time; §7 lists them.

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

### Tested version

| Item | Value | How it was checked |
|---|---|---|
| Repository | `TeekhathatTT/CPE334-QMS` on GitHub | `git remote -v` |
| Branch the owner runs | `TO FILL` (owner decides: `main` or `lab6-staging`). On 2026-11-18 both point to the same commit, so the application code is identical. | `git rev-parse origin/main origin/lab6-staging` after `git fetch` (2026-11-18) |
| Commit SHA | `7edfd9921f72e746004873f84c7e6ed2f48221ef` (`7edfd99`, "Merge pull request #15 from TeekhathatTT/sprint1-staging") | Same command, read on 2026-11-18 |
| Release tag | No release tag. | `git tag` returned nothing (2026-11-18) |

The owner re-checks this SHA before each test session; if the branch moved, update it.

**Confirming the version on the running machine.** The owner runs `git rev-parse HEAD` in the repository folder used to start the app and checks that `git status` shows no local changes (other than the temporary tunnel host setting in §2 B, if used). The result must equal the SHA above. This branch has no health or version endpoint, so the version cannot be read from the browser; the owner tells the testers the SHA at the start of the session.

## 2. Environment (local testing)

There is no cloud deployment. The owner runs QMS on their own machine and the testers use it either on that machine (A) or remotely through a temporary tunnel (B).

### How the app is served on this branch

Checked in `package.json`, `client/package.json`, `client/vite.config.ts`, `server/src/server.ts`, `server/src/app.ts` and the README:

- The browser always opens the **Vite dev server on port 5173** (`npm run dev:client`). It serves the React client and proxies every `/api` request to the API server at `http://localhost:3000` (`client/vite.config.ts`).
- The **API server on port 3000** (`npm run dev:server`) serves only `/api/...`. On this branch it does not serve the client pages, so opening port 3000 in a browser does not show the app.
- The database is the PostgreSQL 16 container `qms-postgres` from `docker-compose.yml` (port 5432).

| Item | Value |
|---|---|
| Supported browsers | Not stated in the SRS or UI spec. The team's own Sprint 1 browser tests ran in Playwright's Chromium, Firefox and WebKit builds on Windows (tests.md §13); real Safari on macOS/iOS and mobile browsers were not tested (tests.md §13.7). `TO FILL`: the browsers the team asks the UAT team to use. |
| Screen sizes | The UI is specified to work without horizontal scrolling at 360 px and 1280 px widths (NFR-06, ui-spec §8.2). |

### Owner: starting the app (both options)

Run from the repository root, following the README "Clean Checkout & Local Setup Guide". First-time setup (environment files, `SESSION_SECRET`, `npm install`, `npm run prisma:generate`) is described there and is not repeated here.

1. `docker compose up -d` (starts PostgreSQL; wait until it accepts connections).
2. `npm run migrate` (applies migrations to the development database).
3. `npm run seed` (creates or updates the seeded accounts, queues and assignment; see §3).
4. Terminal 1: `npm run dev:server` (API on `http://localhost:3000`).
5. Terminal 2: `npm run dev:client` (browser app on `http://localhost:5173`).

`server/.env` must keep `NODE_ENV=development` (as in `.env.example`) for local testing; see the cookie note in option B.

### A. Testing together on one machine (same room or screen share)

| Item | Value |
|---|---|
| URL the tester opens | `http://localhost:5173` (sign-in page: `http://localhost:5173/login`) |
| Where | In a browser on the owner's machine |

Nothing else is needed. Wherever a UAT case says `<BASE_URL>`, use `http://localhost:5173`.

### B. Testing remotely through a temporary tunnel (ngrok or Cloudflare Tunnel)

| Item | Value |
|---|---|
| URL the tester opens | `TO FILL at test time (temporary tunnel URL, sent privately, changes every session)` |
| Port to tunnel | **5173 only** (the Vite dev server) |

Steps for the owner:

1. Start the app as above and check that option A works on the owner's machine.
2. Start a tunnel from the tunnel tool to `localhost:5173`. Use the tool's own documentation; its commands and account token are not part of this repository.
3. Allow the tunnel host name in Vite (see the first check below), then open the tunnel URL in the owner's own browser and sign in once to confirm it works.
4. Send the HTTPS tunnel URL to the UAT team privately, together with the passwords. Wherever a UAT case says `<BASE_URL>`, the tester uses this URL.

Checks, verified against this repository:

- **Vite rejects unknown host names.** `client/vite.config.ts` sets no `server.allowedHosts`, and the installed Vite (5.4.21) answers any request whose host is not `localhost`, `*.localhost` or an IP address with HTTP 403 and the text "Blocked request. This host (…) is not allowed." So a tunnel that forwards its own host name is blocked. Before the session, the owner adds the tunnel host name locally under `server` in `client/vite.config.ts`, for example `allowedHosts: ['<tunnel host name>']`, and restarts `npm run dev:client`. **Do not commit this change**; undo it after the session (`git restore client/vite.config.ts`). The host name is not a secret, but it changes every session and does not belong in the repository.
- **One origin only.** The client calls the API with relative `/api/...` paths and the server allows no cross-origin access unless `CORS_ORIGIN` is set (`server/src/app.ts`; `CORS_ORIGIN` is empty in `.env.example`). The session cookie `qms_session` and the CSRF cookie `qms_csrf` are set with no domain, `SameSite=Lax`, for the host the browser used. Tunnelling port 5173 keeps the pages and `/api` on the same tunnel origin, so sign-in and every action work. Do **not** tunnel port 3000: it has no pages on this branch, and a second origin for the API would break the cookies and the CSRF token.
- **Cookie `Secure` flag.** `server/src/auth/session.ts` marks both cookies `Secure` only when `NODE_ENV=production`. With `NODE_ENV=development` they are not `Secure`, so the browser stores and sends them both on `http://localhost:5173` (A) and on the HTTPS tunnel URL (B). Do not switch to `NODE_ENV=production` for UAT; on this branch that only changes the cookie flag and would break option A, which uses plain HTTP.

### Tunnel safety

- Anyone who has the tunnel URL can open the sign-in page. Share it only with the UAT team, privately, never in GitHub Issues, Pull Requests or commits.
- Use only the seeded demo accounts and the local development database. Never point the app at a database with real data while a tunnel is open.
- Tunnel only port 5173. Do not tunnel the API port 3000 or the database port 5432.
- Close the tunnel and stop the app (`Ctrl+C` in both terminals) when the session ends. A new session gets a new URL.
- Never paste a tunnel account token or tunnel configuration file into this repository.

## 3. Data setup and cleanup

### Starting data (from `server/prisma/seed.ts`)

The owner runs `npm run seed` once before the first session (§2). It creates four accounts (`customer1`, `customer2`, `operator1`, `operator2`), two queues and one operator assignment, all in the local development database (`qms_db` in the `qms-postgres` container):

| Queue | Id | Availability | Assigned operator |
|---|---|---|---|
| General Inquiry Desk | `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` | OPEN | `operator1` |
| Specialized Consultation | `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` | CLOSED | none |

The seed creates no queue entries. On a fresh database both queues have `lastQueueNumber` 0, so the first join gets number 1.

### Data the tests create

Each join creates one queue entry (ticket) for the signed-in customer in "General Inquiry Desk". Operator actions change that entry's status (Waiting → Called → In service → Completed). Each sign-in also creates a session row. Entries cannot be deleted or cancelled from the application, and completed entries stay in the history by design (FR-13).

### Avoiding interference

- There is **one** open queue, **one** assigned operator and **two** customer accounts, shared by every tester. Call Next always takes the oldest waiting entry in the queue, so two testers running cases at the same time will call each other's customers.
- Run UAT-01, UAT-02, UAT-04 and UAT-07 **one tester at a time**. Agree a time slot inside the UAT team (`TO FILL`: how the UAT team books slots).
- Before each of those cases, check the precondition on the `operator1` queue page: "No customers are currently waiting in this queue." and "No entries are currently called or in service."
- After a case, finish every entry you created (Call Next, Start Service, Complete Service as `operator1`). The cases give the clean-up step.
- Do not expect a particular queue number. Numbers never reset in Sprint 1 (BR-04), so they keep rising across testers and runs.

### Reset (owner only)

The repository has **no** command that resets only the application data. What exists:

| Command | What it does | What it does not do |
|---|---|---|
| `npm run seed` | Safe to re-run (it uses upserts). Restores the four accounts (email, password, role, active status), the two queue names and their OPEN/CLOSED state, and `operator1`'s assignment. | Does not delete queue entries or sessions, and does not reset `lastQueueNumber` (the README and the seed comment say this is deliberate). |
| `npm run migrate` | Applies any pending migrations (`prisma migrate deploy`). | Deletes nothing. |

For most problems, the safest option is to finish the stuck entries with `operator1` (Call Next, Start Service, Complete Service) and re-run `npm run seed`. The data then stays, which UAT-07 relies on.

**Full reset to an empty database (deletes data).** Only if the owner really needs a clean start, and never during a test session:

1. Stop the API and the client (`Ctrl+C` in both terminals).
2. `docker compose down -v`. This **deletes the `qms_postgres_data` volume**, which holds **every database in the container**: all queue entries, sessions, accounts and queues in `qms_db`, and the automated test database `qms_test_db`.
3. `docker compose up -d`. On an empty volume the container recreates `qms_db`, and `docker/postgres-init/01-create-test-db.sql` recreates `qms_test_db`.
4. `npm run migrate`, then `npm run seed`. Queue numbers start again from 1. If the owner also runs the automated tests, `npm run migrate:test` as well.

The automated test setup also deletes rows, but only in the separate test database (`TEST_DATABASE_URL`), and it refuses to run when that is missing or equals `DATABASE_URL` (README). It is not a reset tool for UAT.

Testers never reset data. If the shared data gets into a state the testers cannot fix with the operator screens, they contact the owner (`TO FILL`: contact person and channel).

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
| Environment | Browser name and version, screen width, option A (owner's machine) or B (tunnel), and the commit SHA the owner gave for the session (§1) |
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
6. Performance was measured only as one sequential run on one local machine (PERF-001), not under concurrent load. A tunnel (§2 B) adds network delay that PERF-001 did not measure.
7. All Sprint 1 results come from one local Windows machine. Nothing was run in CI or against a deployed environment.

Other limits that affect UAT:

8. A closed queue cannot be joined from the UI because it is never listed, and there is no screen to open or close a queue (see UAT-03).
9. Session expiry (8 hours) cannot be reached in a normal UAT session.
10. The app runs in development mode on the owner's machine (Vite dev server and `tsx watch`), not as a production build. It is available only while the owner's machine, the app and (for option B) the tunnel are running.

## 7. Still to fill and open questions

None of these depend on a cloud deployment.

| Item | Where | Why it is still open |
|---|---|---|
| Branch the owner runs (`main` or `lab6-staging`) | §1 | The owner decides; today both are the same commit. |
| Tunnel URL | §2 B | Created by the owner at test time, sent privately, and different every session. |
| Browsers the UAT team should use | §2 | Not stated in the specs; the team decides. |
| UAT time slots | §3 | Agreed with the UAT team; only one tester at a time can run the queue cases. |
| Owner contact person and channel | §3 | Not yet agreed with the UAT team. |
| Defect-report channel | §5 | Not yet agreed with the UAT team. |

Open questions (not verified in this repository):

1. Whether the chosen tunnel tool can rewrite the forwarded host name to `localhost`, which would remove the need for the temporary `allowedHosts` change in §2 B. That is tunnel-tool behavior, outside this repository.
2. Whether Vite's live-reload connection works through the tunnel. It is only a development aid; the UAT cases do not rely on it.
