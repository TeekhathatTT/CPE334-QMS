# Sprint 3 Completion Table

One row per acceptance criterion. Status is one of `planned`, `in progress`, `implemented`, `tested` or `accepted`. A row moves to `tested` only after its tests were executed and passed, and to `accepted` only after the change is merged to `main`, tagged and deployed. "Executed verification" lists only tests that were actually run.

## F-11 Operational analytics (issue #44)

Contract v1.0 merged `fba2e2f` (PR #73) · red `eb01c13` · implementation `b289de3` · green `e2ea189` · raw output: [evidence/f11-red-run.txt](./evidence/f11-red-run.txt), [evidence/f11-green-run.txt](./evidence/f11-green-run.txt), [evidence/perf-s3-001.txt](./evidence/perf-s3-001.txt) · captions: [evidence/f11-evidence-notes.md](./evidence/f11-evidence-notes.md)

Not verified for F-11: Firefox/WebKit E2E (F-13); the Cloud Run deployment; latency on Cloud Run.

| AC | Status | Implementation | Executed verification | Result | Accepted release |
|---|---|---|---|---|---|
| AC-56 | tested | `analyticsPolicy.summarizeCohort`/`summarizeDurations`, `analyticsService.getQueueAnalytics`, route `GET /api/operator/queues/:queueId/analytics` | ANALYTICS-001, 002, 009 | passed at `e2ea189` | pending release |
| AC-57 | tested | `summarizeCohort` (status buckets; wait only with `calledAt`; service only for `COMPLETED`) | ANALYTICS-003, 004, 009 | passed at `e2ea189` | pending release |
| AC-58 | tested | `bangkokDate`, `parseAnalyticsRange` (UTC+07:00 half-open interval) | ANALYTICS-001, 005 | passed at `e2ea189` | pending release |
| AC-59 | tested | `parseAnalyticsRange` and the strict zod query schema in `routes/operator.ts` | ANALYTICS-001, 006 | passed at `e2ea189` | pending release |
| AC-60 | tested | `requireAuth` → `requireRole(OPERATOR)` → `requireQueueAssignment`; read-only `findMany` | ANALYTICS-007, 008 | passed at `e2ea189` | pending release |
| AC-61 | tested | one indexed read on `QueueEntry_fifo_idx` | PERF-S3-001 (p95 22.0 ms) | passed at `e2ea189` | pending release |
| AC-62 | tested | `client/src/pages/OperatorAnalyticsPage.tsx`, `client/src/api/analytics.ts`, link in `OperatorQueueDetailPage.tsx`, route in `App.tsx` | ANALYTICS-010, 011 (client), ANALYTICS-012 (E2E 1280/360, keyboard), REG-S3-001 | passed at `e2ea189` | pending release |

## F-12 Advance appointment booking

| AC | Status | Implementation | Executed verification | Result | Accepted release |
|---|---|---|---|---|---|
| AC-63 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-64 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-65 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-66 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-67 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-68 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-69 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-70 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-71 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-72 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |

## F-13 Product hardening and launch readiness

| AC | Status | Implementation | Executed verification | Result | Accepted release |
|---|---|---|---|---|---|
| AC-73 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-74 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-75 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-76 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-77 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-78 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-79 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-80 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-81 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |
| AC-82 | planned (contract v1.0; implementation due 13 December) | — | — | — | — |

## Revision history

| Date | Change |
|---|---|
| 2026-11-28 | First version (issue #44). Every Sprint 3 AC is `planned`. |
| 2026-11-28 | F-11 rows AC-56 to AC-62 changed from "planned (contract v1.0 pending review)" to "tested", with the executed verification at `e2ea189`. |
