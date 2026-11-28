# Feature SDS: F-13 Product hardening and launch readiness

| Field | Value |
|---|---|
| Feature | F-13 Product hardening and launch readiness |
| Sprint | 3. The contract is due at the 29 November 2026 checkpoint. Implementation and verification are due 13 December 2026. |
| Issue | #44 (contract). The implementation issue will be created after 29 November. |
| Depends on | F-01 – F-12 |
| Contract version | v1.0 (2026-11-28) |
| Status | Contract v1.0, pending review by `@Khwanklao`; not implemented |
| Author / reviewer | `@TeekhathatTT` / `@Khwanklao` |
| Governing documents | [SRS](../srs.md) v6.0 (FR-31, FR-32, BR-33, NFR-09–NFR-13, §10.6 AC-73–AC-82), [Sprint 3 API spec](../sprints/sprint-3/api-spec.md) §4, [tests.md](../sprints/sprint-3/tests.md) §4 |

## 1. Purpose and scope

The Sprint 1 and Sprint 2 NFRs (NFR-01 to NFR-08) are met and verified. Before a final launch the product still lacks four things:
- defensive HTTP headers
- protection against password guessing
- an accessibility check
- cross-browser evidence

Operations also lack written, rehearsed recovery steps. F-13 adds these as measurable criteria and a launch checklist that is executed on the tagged release candidate.

| Gap found on 2026-11-28 | Where | F-13 item |
|---|---|---|
| No security headers. Express sends `X-Powered-By`. | `server/src/app.ts` (no helmet or equivalent) | NFR-09, AC-73 |
| Unlimited login attempts | `POST /api/auth/login` | FR-31, NFR-10, AC-75 |
| No structured access log (only `requestId` on errors) | `server/src/middleware/requestId.ts`, `errorHandler.ts` | NFR-13, BR-33, AC-74 |
| No accessibility scan | E2E suite | NFR-11, AC-76 |
| E2E evidence on Chromium only | `npm run test:e2e` | NFR-12, AC-77 |
| Rollback and restore not rehearsed; backup settings not recorded | `docs/labs/lab-05/deployment.md` | NFR-13, AC-81, AC-82 |
| One accepted Lab 6 defect (#66) waiting for the partner's re-test | issue #66 | AC-79 |

Out of scope: a WAF or Cloud Armor, MFA, CAPTCHA, penetration testing by a third party, multi-region deployment, and paid uptime monitoring.

## 2. Decisions

| ID | Decision | Reason |
|---|---|---|
| D-1 | Set the headers in one small middleware (or `helmet` with an explicit config) before all routes. The CSP is `default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`. Send HSTS only when `NODE_ENV=production`. Disable `X-Powered-By`. | The client is a same-origin Vite build with no third-party scripts, so a strict CSP is possible. Sending HSTS on local HTTP would break development. |
| D-2 | Login throttle state is kept in a new table, `LoginThrottle (key text PK, windowStart timestamptz, failures int)`, updated in the login transaction. Keys are `email:<normalized>` and `ip:<addr>`. Limits: 5 failures per email and 20 per IP in a 15-minute fixed window. A throttled key returns `429 RATE_LIMITED` with `Retry-After` (seconds). A success deletes the email key. | Cloud Run can run several instances, so memory counters would not hold. A fixed window is simple to test with explicit timestamps. |
| D-3 | Unknown and known emails go through the same counter and the same response sequence (`401 … 429`). The bcrypt compare still runs against a dummy hash for unknown emails. | No user enumeration through status codes or timing (NFR-01). |
| D-4 | The access log is one JSON line per finished response (`res.on('finish')`) with an allow-list of fields only (BR-33). | It is safe by construction. A test captures the log lines and asserts that no secret appears. |
| D-5 | Accessibility is checked with `@axe-core/playwright` in the existing E2E suite: tag `wcag2a`, `wcag2aa`, `wcag21aa`; the build fails on `serious` or `critical`. | It runs in CI with no new tooling. |
| D-6 | Rollback is rehearsed on Cloud Run with `gcloud run services update-traffic qms --to-revisions=<previous>=100`, then traffic goes back to the latest revision. Each step is timed against the 10-minute target. Run only with the user's approval, and record it in `deployment.md`. | This is the fastest safe rollback for a stateless revision. All schema changes are additive (migrate-before-deploy), so the previous revision still runs on the newer schema. |
| D-7 | The launch checklist is a section of `docs/sprints/sprint-3/completion.md`, filled with commit SHAs, CI run IDs, test counts and revision names. Each item counts only when it was executed (FR-32). | One auditable place for the final release. |

## 3. Data definitions

| Object | Definition |
|---|---|
| `LoginThrottle` (planned additive migration `<timestamp>_f13_login_throttle`) | `key varchar(320) PK`, `windowStart timestamptz NOT NULL`, `failures int NOT NULL CHECK (failures >= 0)` |
| All other tables | **no change** |

## 4. API and UI changes

- `POST /api/auth/login`: adds `429 RATE_LIMITED` with a `Retry-After` header ([api-spec §4](../sprints/sprint-3/api-spec.md#4-f-13-product-hardening)). There is no change to `200` or `401`.
- Every response: adds the NFR-09 headers and drops `X-Powered-By`.
- UI: the login page shows "Too many sign-in attempts. Try again in N minutes." for `429` ([ui-spec §4](../sprints/sprint-3/ui-spec.md#4-f-13-hardening-ui-changes)). Accessibility fixes found by the axe scan are made where the scan flags them; no planned layout change.

## 5. Acceptance criteria, tests and DoD

AC-73 to AC-82 are in SRS §10.6. Planned tests: `HARD-001`–`HARD-012` ([tests.md §4](../sprints/sprint-3/tests.md#4-f-13-product-hardening-and-launch-readiness)).

DoD (13 December):
- [ ] Contract reviewed and merged
- [ ] RED then GREEN for HARD-001–HARD-006
- [ ] Axe and three-browser E2E evidence
- [ ] Rollback and backup evidence
- [ ] Launch checklist complete on the tagged final release
- [ ] Partner re-test of #66 closed

## 6. Review questions

| # | Question | Proposed answer |
|---|---|---|
| R-1 | `helmet` dependency or own middleware? | Either is acceptable if HARD-001 passes. Prefer `helmet` with an explicit config (less custom code). |
| R-2 | Are 5 per email and 20 per IP in 15 minutes too strict for the UAT team sharing one IP? | 20 per IP allows a shared classroom IP. Successful logins do not count. |
| R-3 | Rehearse rollback on `qms` or on `qms-bugbash`? | On `qms-bugbash` first, then once on `qms` during a quiet period, with the user's approval. |

## 7. Revision history

| Version | Date | Author | Sections | Previous text | Change |
|---|---|---|---|---|---|
| v1.0 | 2026-11-28 | `@TeekhathatTT` | All | — | First contract (issue #44), aligned with SRS v6.0. Pending review by `@Khwanklao`. |
