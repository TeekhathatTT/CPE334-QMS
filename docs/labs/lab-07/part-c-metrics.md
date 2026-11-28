# Lab 7 Part C: Objective Engineering Metrics

> **Issue:** #53 | **Repository scope:** `TeekhathatTT/CPE334-QMS` only (the partner team's repository is used only as the source of findings about our product in M-4)
> **Observation window (M-1, M-2, M-5):** 2026-11-22 00:00 ICT to 2026-11-28 12:30 ICT (`2026-11-21T17:00:00Z` to `2026-11-28T05:30:00Z`). The window opens on the day the Sprint 2/3, Deliverable 2 and Lab 7 issues were planned (#40–#55) and closes after the Lab 7 release was deployed.
> **Release snapshot (M-3, M-4):** main release `1f34952` (PR #59), Cloud Run revision `qms-00006-6bj`, `/api/health` → `{"status":"ok","database":"ok","version":"1f34952"}` (checked 2026-11-28 05:30 UTC)

## 1. Summary

| ID | Metric | Definition | Value | Source |
|---|---|---|---|---|
| M-1 | Completed Issues | Issues closed with reason *completed* in the window. Issues closed as *not planned* are listed separately: they were duplicates merged into consolidated issues on 2026-11-22, not finished work | **10 completed**; 6 not planned (duplicates); 0 other cancelled | `evidence/metrics-m1-issues.txt` |
| M-2 | Merged PRs | PRs merged in the window, grouped by target branch. Closed-unmerged PRs are listed separately | **14 merged**: `sprint2-staging` 6, `lab5-staging` 3, `main` 3, `lab7-staging` 2. 1 closed unmerged (#33, the deliberate C-02 failing-check demo) | `evidence/metrics-m2-prs.txt` |
| M-3 | Automated test results | Pass/fail/skip of the **server suite** (`npm test` = `vitest run` in `server/`, real PostgreSQL) in CI run `45961454874`. The run tested `63dfcf4`, whose tree is identical to the release `1f34952` | **147 passed / 0 failed / 0 skipped** (12 files). Same run, client suite: 78 / 0 / 0 (5 files) | `evidence/metrics-m3-ci-tests.txt` |
| M-4 | UAT defect status | Findings that the independent UAT team (Lab 6) reported about our Sprint 1 release, with status at the snapshot. **Resolved** = fixed and re-tested by the UAT team, or explicitly accepted by them as a known limitation | **2 findings, 0 product defects; 1/2 resolved** (UATF-01). UATF-02 is open | §2.4 below (copied from the partner's `findings-reported.md`) |
| M-5 | CI run outcomes | Runs of the required check workflow `ci-docker.yml` ("Build, Migrate, Seed, Test & Docker Image") on all branches in the window; `deploy.yml` reported separately | **27 success / 4 failure / 0 cancelled of 31** (success rate 27/31 = 87.1%; 27/29 = 93.1% excluding the 2 intended failures: the C-02 demo and a TDD red push). `deploy.yml`: 4/4 success | `evidence/metrics-m5-ci-runs.txt` |

The reviewer (@Khwanklao) re-checks M-2 and M-5 against the embedded lists in §2. The check is recorded in §4.

## 2. Embedded source lists

### 2.1 M-1 Completed Issues (closedAt, UTC)

| Issue | Closed | Reason | Title |
|---|---|---|---|
| #20 | 2026-11-21 18:00 | completed | [Lab 5 - Ep.6] Connect GitHub to GCP via WIF and configure required CI merge gate |
| #21 | 2026-11-21 19:55 | completed | [Lab 5 - Ep.7] Add automated deploy workflow and release a visible change to main |
| #23 | 2026-11-21 21:14 | completed | [Lab 5 - Ep.8] Verify data persistence across restarts and redeploys |
| #39 | 2026-11-22 05:09 | completed | fix(test): flaky client test 'loading state, then a neutral empty state' blocks required CI |
| #51 | 2026-11-27 05:00 | completed | [Lab 7 - Part A] Approved Sprint 1 change request, impact analysis and reviewed contract |
| #40 | 2026-11-27 05:38 | completed | [Sprint 2 - F-07] Customer cancellation and queue withdrawal |
| #52 | 2026-11-27 08:34 | completed | [Lab 7 - Part B] Test-first implementation, regression and deployed release of the change |
| #41 | 2026-11-27 08:54 | completed | [Sprint 2 - F-08] No-show handling and recovery |
| #42 | 2026-11-27 15:43 | completed | [Sprint 2 - F-09] Multi-counter support |
| #26 | 2026-11-27 18:28 | completed | [Lab 6 - Part B] Execute independent UAT on partner team's Sprint 1 release |
| #45, #46, #47, #48, #54, #55 | 2026-11-22 08:00 | not planned | duplicates folded into #44, #49, #50 and #53 when the plan was consolidated to 10 issues |

Lab 7 maintenance issues completed: 2 (#51, #52). #53 (this part) is open at the snapshot. Note: #40–#42 are Sprint 2 work merged to `sprint2-staging` only; they are **not** part of the deployed release `1f34952`.

### 2.2 M-2 Merged PRs (mergedAt, UTC)

| PR | Merged | Head → base | Title (short) |
|---|---|---|---|
| #34 | 2026-11-21 17:59 | feature/lab5/6-wif-merge-gate → lab5-staging | WIF and required merge gate |
| #35 | 2026-11-21 19:41 | lab5/7-auto-deploy-workflow → lab5-staging | automated Cloud Run deploy workflow |
| #36 | 2026-11-21 19:55 | lab5-staging → main | release(lab5): v1.1 via GitHub Actions |
| #37 | 2026-11-21 21:13 | lab5/8-verify-persistence → lab5-staging | C-06 and C-05 evidence |
| #38 | 2026-11-21 21:20 | lab5-staging → main | release(lab5): C-06/C-05 evidence (`e304cd9`, Sprint 1 baseline) |
| #57 | 2026-11-27 04:55 | docs/lab7-part-a-contract → lab7-staging | **Lab 7 Part A contract** |
| #56 | 2026-11-27 05:36 | feature/sprint2/40-… → sprint2-staging | F-07 |
| #58 | 2026-11-27 06:52 | maintenance/lab7/52-max-active-entries → lab7-staging | **Lab 7 Part B implementation** |
| #59 | 2026-11-27 08:33 | lab7-staging → main | **Lab 7 release (`1f34952`)** |
| #60 | 2026-11-27 08:54 | feature/sprint2/41-… → sprint2-staging | F-08 |
| #61 | 2026-11-27 11:23 | feature/sprint2/42-multi-counter-support → sprint2-staging | F-09 contract |
| #62 | 2026-11-27 15:23 | feature/sprint2/42-multi-counter-impl → sprint2-staging | F-09 implementation |
| #63 | 2026-11-27 15:42 | chore/sprint2/merge-main-lab7 → sprint2-staging | Lab 7 BR-06 merged into the Sprint 2 line |
| #64 | 2026-11-27 15:42 | docs/sprint2/42-f09-evidence → sprint2-staging | F-09 evidence |
| #33 (closed, not merged) | 2026-11-21 17:09 | tmp/lab5-c02-failing-check → lab5-staging | C-02 demo: a failing check blocks merge |

Lab 7 maintenance PRs: #57 → #58 → #59.

### 2.3 M-3 Automated test results (CI run 45961454874)

```
Run npm test                     (server, after migrate, migrate:test, seed and typecheck)
 ✓ tests/queue-registration.test.ts (32 tests)
 ✓ tests/integration-sprint1.test.ts (9 tests)
 ✓ tests/operator-workflow.test.ts (18 tests)
 ✓ tests/foundation.test.ts (16 tests)
 ✓ tests/auth.test.ts (18 tests)
 ✓ tests/seed.test.ts (7 tests)
 ✓ tests/rbac-middleware.test.ts (9 tests)
 ✓ tests/csrf.test.ts (6 tests)
 ✓ tests/join-csrf.test.ts (6 tests)
 ✓ tests/health.test.ts (7 tests)
 ✓ tests/static-client.test.ts (10 tests)
 ✓ tests/config.test.ts (9 tests)
 Test Files  12 passed (12)
      Tests  147 passed (147)        ← 0 failed, 0 skipped
Run npm run test:client
 Test Files  5 passed (5)
      Tests  78 passed (78)
```

`queue-registration.test.ts` holds the Lab 7 BR-06 tests (QUEUE-008 – QUEUE-011, CONCURRENCY-005). E2E (Playwright, Chromium) is not part of CI. It was run locally on `bfa2464`: 12 / 0 / 0 (`evidence/regression-e2e.txt`, Part B §4).

### 2.4 M-4 UAT findings about our release (status at 2026-11-28 05:30 UTC)

| Finding | Reported by | Tested version | Type / severity | Status | Resolved? |
|---|---|---|---|---|---|
| UATF-01 | partner UAT team (Worapol360, aranedlek), observed 2026-11-24 21:52 ICT | deployment before 2026-11-25 | Environment incident: `/api/health` showed `database: unavailable` and login returned 500, because Cloud SQL had been stopped to save credit. Not a product-logic defect | Cloud SQL restarted 2026-11-25; the full UAT round passed on `e304cd9` on 2026-11-26 | **Yes**: re-tested by the UAT team |
| UATF-02 | same | `e304cd9` | Handoff gap, Minor: UAT-07 Parts 2–3 tell the tester to restart a local server/container, which they cannot do on Cloud Run, so the steps are BLOCKED | Not yet dispositioned in our Lab 6 Part C (#27) | **No** |

UAT results on `e304cd9`: UAT-01 – UAT-06 and UAT-08 PASS, UAT-07 Part 1 PASS, UAT-07 Parts 2–3 BLOCKED. Open product defects: none.

### 2.5 M-5 CI run outcomes

`ci-docker.yml`, 31 runs: 27 success, 4 failure, 0 cancelled.

| Failed run | Branch @ commit | Cause (from the run log) |
|---|---|---|
| 44927871890 | tmp/lab5-c02-failing-check @ `36c0783` | **Deliberate**: Lab 5 C-02 demo proving the required check blocks merge (PR #33, closed) |
| 44933025820 | lab5-staging @ `0247e46` (push) | **Flaky test**: `client/src/test/customer.test.tsx` › "Available Queues › shows a loading state, then a neutral empty state" |
| 45932462678 | feature/sprint2/40-… @ `477febb` | **Intended TDD red**: `477febb` is the F-07 red-test commit ("failing tests for customer cancellation (TDD red)"). It was pushed before the migration and implementation, so the F-07 tests failed (`invalid input value for enum "QueueStatus": "CANCELLED"`). The PR head was green again at `3e90e86` |
| 46022578564 | chore/sprint2/merge-main-lab7 @ `b03a88b` | **Flaky test**: the same client test. A docs-only commit; the next push passed |

`deploy.yml`, 4 runs, all success: 44943558046 (`ab5ab9d`), 44945131409 (`ab5ab9d`, manual), 44951072710 (`e304cd9`), 45966592373 (`1f34952`, Lab 7 release → `qms-00006-6bj`).

## 3. Interpretation (≤ 100 words)

Released Sprint 1 results are clean (147/0/0 tests, 0 product defects). CI shows the one unexpected failure cause: the same client test failed twice, once five days after #39 was closed as fixed. Both unexpected failures (2 of 31 runs) were this flake. A flaky required check blocks merges in release week and teaches us to re-run red builds without reading them. **Action:** before the Final Delivery release PR, @TeekhathatTT will:
1. reopen #39;
2. make the test await an explicit fetch promise;
3. record 20 consecutive passing runs of `customer.test.tsx`.

*(91 words)*

## 4. Reviewer check of two values

| Value | Re-counted from | Result | Checked by / date |
|---|---|---|---|
| M-2 = 14 merged PRs | §2.2 table and `metrics-m2-prs.txt` | _to be filled by @Khwanklao_ | |
| M-5 = 27 success / 4 failure of 31 | §2.5 and `metrics-m5-ci-runs.txt` | _to be filled by @Khwanklao_ | |
