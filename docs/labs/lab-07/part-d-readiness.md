# Lab 7 Part D: Release Readiness and Retrospective

> **Issue:** #53 | **Scope assessed:** the maintained Sprint 1 functionality in the deployed release, including the approved Lab 7 change (BR-06: at most 2 active entries per customer across all queues) and the previously accepted Sprint 1 behavior. Sprint 2 features (F-07, F-08, F-09) exist only on `sprint2-staging`. They are **not** deployed and are **not** assessed here.
> **Checklist date:** 2026-11-28 (snapshot 05:30 UTC). Metric sources are in [part-c-metrics.md](./part-c-metrics.md).

## 1. Release readiness checklist

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Submitted / deployed version | `main` release `1f34952` (PR #59, merged 2026-11-27 08:33 UTC). Deploy run `45966592373` succeeded. Cloud Run revision **`qms-00006-6bj`** serves 100% of traffic. https://qms-1036193964355.asia-southeast1.run.app → `/api/health` `{"status":"ok","database":"ok","version":"1f34952"}` (rechecked 2026-11-28 05:30 UTC) | Part B §1; #52 comment |
| 2 | Version chain | Sprint 1 baseline `e304cd9` / `qms-00005-5kz` → pre-change `aa1c0fa` (contract only; `server/` and `client/` identical to baseline) → tests `2664740` → implementation `bfa2464` → `lab7-staging` merge `63dfcf4` (PR #58) → `main` `1f34952` (PR #59; same tree as `63dfcf4`) → `qms-00006-6bj`. No Sprint 2 commit is in `1f34952` | Part B §1 |
| 3 | Defects by severity / status | Critical 0, Major 0. Minor: none in product behavior. Open findings: UATF-02 (Minor, UAT handoff gap: UAT-07 Parts 2–3 assume a local restart). Resolved: UATF-01 (environment incident: Cloud SQL had been stopped; re-tested by the UAT team on 2026-11-26) | Part C M-4 |
| 4 | Automated tests on the release tree | CI run `45961454874` @ `63dfcf4` (= `1f34952`): server **147 passed / 0 failed / 0 skipped**, client **78 / 0 / 0**, typecheck and build passed | Part C M-3 |
| 5 | Other automated tests | E2E Playwright Chromium on `bfa2464` (local): **12 / 0 / 0**. Firefox and WebKit: **not run**. CONCURRENCY-005 repeated 5×: 5/5 | Part B §3.2, §4 |
| 6 | Selected user tests | **Manual** post-deploy API checks on the live URL, 2026-11-27 08:44 UTC: **5/5 as expected**. 3rd-queue join → `409 MAX_ACTIVE_ENTRIES_REACHED`; duplicate at the cap → `409 DUPLICATE_ACTIVE_ENTRY`; cross-customer read → `404` (preserved Sprint 1 access path). Independent UAT (Lab 6, partner team, on `e304cd9`): 7 of 8 cases PASS; UAT-07 Part 1 PASS; **UAT-07 Parts 2–3 BLOCKED** (restart not possible on Cloud Run) | #52 comment; Part C §2.4 |
| 7 | Technical debt | 4 items, see §2 | §2 |
| 8 | Configuration / secrets | Runtime values come from Secret Manager: `qms-database-url`, `qms-session-secret` and `qms-seed-password` (seed only). They are read by runtime service account `qms-run`, which has only `cloudsql.client` and `secretAccessor` on those secrets. GitHub deploys through Workload Identity Federation with no stored key. No secret is in Git or in this document. Test accounts are handed over privately | `docs/labs/lab-05/deployment.md` §3, §9 |
| 9 | Documentation / run instructions | `README.md`: clean checkout, local setup, migrate, seed, run, test. `docs/labs/lab-05/deployment.md`: environment variables, container, CI, GCP infrastructure, deploy and "which commit is running". The Lab 7 contract changes are in SRS v1.1, System SDS v1.1 and STS v1.2 | repo |
| 10 | Deployment / smoke status | The deploy pipeline is green (4/4 `deploy.yml` runs in the window). The pipeline's own smoke step passed in run `45966592373`: `GET /api/health` returned 200 with `version=1f34952`, and `GET /` returned 200. Health is OK on `1f34952`. Post-deploy checks passed. The temporary check queues "Lab 7 Check Queue B/C" are CLOSED and customer1's check entries are COMPLETED, so production data is back to the seeded catalog | #52 comment |

### Decision: **READY** for the maintained Sprint 1 scope

Reasons:
- The changed rule passes on the deployed revision. It was shown failing on the pre-change code, then passing (Part B §2–§3).
- The previously accepted behavior still passes: 147 + 78 automated tests with 0 failed or skipped, 12 E2E, and a live cross-customer `404`.
- No Critical, Major or Minor product defect is open.

Outstanding items (they do not block the Sprint 1 scope; each has an owner):

| Item | Owner | Action / milestone |
|---|---|---|
| UATF-02 not dispositioned; UAT-07 Parts 2–3 BLOCKED | @TeekhathatTT | Record it in Lab 6 Part C (#27) as an accepted handoff defect. Rewrite UAT-07 Parts 2–3 so they run on Cloud Run (we redeploy or restart the revision and tell the UAT team). Ask the partner to re-run before Final Delivery. Persistence across restart and redeploy was already verified in Lab 5 check C-05 |
| Flaky required CI test (Part C action) | @TeekhathatTT | Reopen #39, make the test deterministic, and record 20 consecutive passing runs before the Final Delivery release PR |
| E2E only on Chromium | @Khwanklao | Run `npm run test:e2e:all-browsers` on the Final Delivery release candidate |
| Sprint 2 release (F-07/F-08/F-09) | @TeekhathatTT (#49) | Release only after this PDF is submitted, because any push to `main` redeploys and replaces `qms-00006-6bj`. At release, run the F-07/F-08/F-09 migrations on Cloud SQL, then `provision:counters` and smoke checks |

## 2. Technical debt (deferred work, separate from defects)

| Item | Impact | Priority | Disposition / action |
|---|---|---|---|
| Flaky client test `customer.test.tsx` › "shows a loading state, then a neutral empty state". It failed CI twice in the window, once after #39 was closed as fixed | A red required check blocks merges and hides real failures behind re-runs | High | Fix before the Final Delivery release (Part C action; owner @TeekhathatTT) |
| `deploy.yml` has no `paths-ignore`: every push to `main`, even docs-only, rebuilds and redeploys | Changes the deployed revision that reports cite, and spends build time and credit | Medium | Add `paths-ignore: ['docs/**']` after Lab 7 is submitted (owner @TeekhathatTT) |
| No repeatable production smoke fixture: production has one OPEN queue, so the BR-06 check needed two temporary queues inserted through the Cloud SQL Auth Proxy | Manual, error-prone post-deploy checks; test data left in production (now CLOSED) | Medium | Add a scripted smoke check with a dedicated smoke queue and account before the Sprint 2 release (owner @Khwanklao) |
| The rollback test NUMBER-002 makes the app log a `[Unhandled Error] PrismaClientKnownRequestError` stack trace in every server run, although the test passes | Log noise makes a real unhandled error easy to miss | Low | Make the test expect and suppress that log, or label it as an expected error (owner @Khwanklao, Final Delivery) |

Later-sprint note: integrating BR-06 into the Sprint 2 line found that F-08's "return to queue" could bypass the cap. That path is not in the deployed release. It was fixed test-first on `sprint2-staging` (PR #63, NOSHOW-021 – NOSHOW-023) before any Sprint 2 release.

## 3. Retrospective

| Question | @TeekhathatTT | @Khwanklao |
|---|---|---|
| What helped | Writing the tests first and running them on the old code (`aa1c0fa`) proved they failed only because the rule was missing. The Part A contract review caught the locking issue (`FOR NO KEY UPDATE`) before any code was written. | _to be written by @Khwanklao_ |
| What hurt | Production had only one OPEN queue, so the post-deploy check needed extra queues inserted through the Cloud SQL proxy. `deploy.yml` redeploys on every push to `main`, even for docs. | _to be written by @Khwanklao_ |
| What will change | Prepare a smoke-test queue and account for production in advance. Add `paths-ignore: docs/**` to `deploy.yml` after Lab 7 is submitted. | _to be written by @Khwanklao_ |

## 4. Contributions, AI use and known limitations

| Work | Author | Reviewer |
|---|---|---|
| Part A: change request, impact analysis, contract (#51, PR #57) | @Khwanklao | @TeekhathatTT |
| Part B: red/green, implementation, regression, release, post-deploy checks (#52, PRs #58, #59) | @TeekhathatTT | @Khwanklao |
| Parts C and D: metrics, readiness, retrospective (#53) | @TeekhathatTT | @Khwanklao (re-checks M-2 and M-5; writes their retrospective) |

**AI use:** Claude Code (Anthropic) was used in this part to collect the metric source lists with the `gh` CLI, find the cause of each failed CI run from its log, and draft Parts C and D. The students checked every value against the embedded lists, and the reviewer re-counted two metrics (Part C §4). _Students: add any AI use in Parts A and B._

**Known limitations:**
- E2E runs only on Chromium.
- UAT-07 Parts 2–3 are blocked on Cloud Run.
- The metric window combines Lab 5 close-out, Lab 7 and Sprint 2 activity in one repository. Sprint 2 work is labelled and is not in the release.
- M-3 comes from the CI run on `63dfcf4`, whose tree equals `1f34952`. There is no separate CI run on the merge commit, because `deploy.yml` does not run tests.
