# F-11 Evidence Notes for the Deliverable 2 PDF

| Item | Value |
|---|---|
| Contract | v1.0 merged before any F-11 code (PR #73, merge `fba2e2f`, reviewed by @Khwanklao) |
| TDD red commit | `eb01c13`. Red run: server F-11 0/18 (8 API tests failed with `404`; the unit file failed to load because `analyticsPolicy` did not exist) with the existing 280/280 green; client F-11 0/10 with the existing 138/138 green; E2E ANALYTICS-012 failed (no Analytics link). |
| Implementation | `b289de3` (server and client) |
| Fixes found by the green run | `5e30d5a`: two setup bugs in the new API tests (re-login after `resetAndSeed()`; ANALYTICS-009 loads DS-11 without its WAITING rows E8 and X1). `543e36c`: exact label match in the E2E test. `94b214b`: UI fix, daily cards below `sm` so nothing crosses 360 px. No assertion was weakened. |
| Green commit | `e2ea189`: server 298/298, client 148/148, E2E Chromium 26/26, PERF-S3-001 p95 22.0 ms (target ≤ 500 ms) |
| Raw output | [f11-red-run.txt](./f11-red-run.txt), [f11-green-run.txt](./f11-green-run.txt), [perf-s3-001.txt](./perf-s3-001.txt) |
| Tested version | local build of `e2ea189` (not yet released; the footer still shows the base release string) |

## Screenshots

| File | AC | Role | Preconditions | Steps | Expected | Actual |
|---|---|---|---|---|---|---|
| `f11-01-operator-analytics-1280.png` | AC-62 (and AC-56 values for the live data) | OPERATOR (operator1, assigned to General Inquiry Desk) | Seeded DB. Today one customer joined and was called, started and completed through the API. | Open `/operator/queues/{Q}`, click **Analytics** (link "View analytics for General Inquiry Desk"). Viewport 1280 × 800. | The heading "General Inquiry Desk — Analytics"; the default range is the last 7 days; Joined 1 and Completed 1; the daily table has 7 rows; no horizontal overflow. | As expected (ANALYTICS-012 passed at `e2ea189`). |
| `f11-02-operator-analytics-360.png` | AC-62 (NFR-06) | OPERATOR | Same page after the keyboard-only **Show report** (Tab to the button, press Enter). | Resize to 360 × 800. | The same figures; the daily breakdown is shown as one card per day; no element crosses the viewport edge. | As expected (ANALYTICS-012 passed at `e2ea189`). |

The durations in both screenshots show `0m 00s`, because the E2E journey runs in well under a second. The exact duration values are checked by ANALYTICS-002 against the known dataset DS-11 (for example, average wait 351.4 s).
