# Issue #7 — Checklist Review Aid (for the issue owner)

This page is a **review aid**. It is not an approval. The boxes are deliberately left unticked: only the person responsible for Issue #7 can confirm the Acceptance Criteria and approve the Definition of Done in the issue itself. Each line points to the evidence for that item so the owner can check it quickly.

The items follow the Issue #7 scope as given to the implementer. The exact wording of the issue's own checklists could not be read while this PR was prepared (GitHub CLI not authenticated). If the issue's wording differs, the issue wording is the one that counts.

## Scope / acceptance items

| ✓ | Item | Evidence |
|---|---|---|
| [ ] | Customer and Operator workflows tested end to end | E2E S1, S4, S5 in Chromium, Firefox and WebKit (tests.md §13.4); server §3 cross-role API flow (§13.2) |
| [ ] | Queue rules: FIFO, uniqueness, duplicate prevention, ownership, state transitions, concurrency | Server §3–§4 with SQL invariant checks (§13.2); E2E S2, S3, S8 |
| [ ] | Authorization: Customer, Operator, unauthenticated | Server §1–§2 (55 invalid-identity requests, 22-row role table, CSRF matrix); client guards (§13.3); E2E S6, S7 |
| [ ] | API integration | `server/tests/integration-sprint1.test.ts` plus the existing suites: server 118 passed |
| [ ] | E2E automated tests, 8 scenarios | S1–S8 passed in two consecutive runs × 3 browsers (`e2e-run.txt`) |
| [ ] | Regression: backend, frontend, integration, E2E | §13.1: typecheck, build, server 118, client 77, E2E 34 passed + 2 skipped (WebKit keyboard, reason in the test) |
| [ ] | Test evidence including screenshots | 32 PNGs, mapped in `README.md`; `e2e-run.txt`, `perf-001.txt`, `rel-001.txt` |

## Definition of Done items

| ✓ | Item | Evidence |
|---|---|---|
| [ ] | FLOW-009, FLOW-010, UI-001 verified by a real browser run | tests.md §13.4–§13.5 |
| [ ] | PERF-001 and REL-001 verified by measured runs | tests.md §13.9; REL-001 now uses an isolated throwaway container |
| [ ] | Every PASSED result comes from a recorded command | tests.md §13.1 |
| [ ] | No production code changed and no existing test weakened | §13.6 defect log: none found; PR diff touches only tests, docs, `package.json` and `.gitignore` |
| [ ] | No secrets, `.env*`, `node_modules` or Playwright output committed | `.gitignore`; PR diff |
| [ ] | Spec gaps recorded, not decided (3 items) | tests.md §13.8 — needs a decision from the spec owner |
| [ ] | Remaining not-verified items accepted | tests.md §13.7 (real Safari/mobile, physical touch device, screen-reader listening, load testing, CI) |

Approved by: ____________________  Date: __________
