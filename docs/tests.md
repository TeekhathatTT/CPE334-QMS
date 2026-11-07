# Software Test Specification (STS)

This document specifies tests only; implementation/execution belongs to Issues #2–#7. No test is claimed as passed. Each row includes preconditions, input/action, expected result, level and priority. Fixture shorthand: `C1/C2` are active Customers, `O1/O2` active Operators, `Q1` OPEN assigned to O1, `Q2` OPEN assigned only to O2. Times are controlled UTC values unless testing concurrency.

| Test ID | Name; FR/BR; AC | Preconditions / inputs / steps | Expected result | Level | Priority |
|---|---|---|---|---|---|
| AUTH-001 | Customer login; FR-01; AC-01 | C1 active with known fixture password; POST login | 200 session cookie and role CUSTOMER; no password in response | Integration | P1 |
| AUTH-002 | Operator login; FR-01; AC-01 | O1 active; POST login | 200 session and OPERATOR role | Integration | P1 |
| AUTH-003 | Logout revokes session; FR-02; AC-01 | Login, retain cookie, POST logout then GET me | 204 then 401 | Integration | P1 |
| AUTH-004 | Invalid/disabled credentials generic; FR-01; AC-02 | Try wrong password, unknown email and disabled user | Same 401 code/message; no valid session | Integration | P1 |
| AUTH-005 | Anonymous protected access; FR-02; AC-03 | Call join, own entry, operator list and action without cookie | Each protected call 401; no state change | Integration | P1 |
| QUEUE-001 | Open catalog only; FR-04, BR-08; AC-06 | Seed OPEN Q1 and CLOSED Q3; GET queues | OPEN queues only; response has no customer fields | Integration | P1 |
| QUEUE-002 | Successful join; FR-05/06/13; AC-07/08 | C1 joins Q1 | 201 one WAITING entry with ID, queue, number, UTC joinedAt | Integration | P1 |
| QUEUE-003 | Duplicate active join rejected; FR-12, BR-05; AC-07 | C1 has WAITING in Q1; join Q1 again | 409 DUPLICATE_ACTIVE_ENTRY; count unchanged | Integration | P1 |
| QUEUE-004 | Unknown/closed queue; FR-04/12, BR-08; AC-07 | Join unknown ID and CLOSED Q3 | 404 then 409 QUEUE_NOT_AVAILABLE; no entry | Integration | P1 |
| QUEUE-005 | Rejoin after completion; FR-05, BR-05; AC-08 | C1's Q1 entry completed; join Q1 | New entry ID/number; prior completed entry retained | Integration | P1 |
| QUEUE-006 | Own detail privacy; FR-07, BR-07; AC-10 | C1 reads own entry and another customer entry | Own returns detail; other's returns same 404 shape as nonexistent; no PII leak | Integration | P1 |
| QUEUE-007 | Operator FIFO listing; FR-08, BR-01; AC-11 | Create entries with ordered and tied joinedAt values; O1 lists Q1 | Sorted joinedAt then ID; only permitted customer display data | Integration | P1 |
| QUEUE-008 | Multiple queues proposed behavior; BR-06; AC-07 | C1 joins Q1 then Q2 | Both active entries allowed if proposal approved; otherwise test expectation updated by decision record | Integration | P2 |
| NUMBER-001 | Scope and no reuse; FR-06, BR-02/04; AC-09 | Sequential joins across Q1 and Q2; complete then rejoin Q1 | Numbers unique per approved scope, never reused; reset behavior follows approved decision | Integration | P1 |
| NUMBER-002 | Number allocation rollback; FR-06, BR-03; AC-09 | Force insert failure after counter allocation in a transaction | Failed transaction creates no entry and no committed allocation gap per chosen policy | Integration | P1 |
| FLOW-001 | Call Next picks oldest WAITING only; FR-09, BR-01; AC-11/12 | Q1 has older WAITING, newer WAITING and older CALLED; O1 calls next | Oldest WAITING alone becomes CALLED | Integration | P1 |
| FLOW-002 | WAITING to CALLED; FR-09, BR-09; AC-12 | O1 calls non-empty Q1 | Status CALLED, calledAt UTC set once | Integration | P1 |
| FLOW-003 | Empty queue; FR-09/12, BR-10; AC-13 | Q1 has no WAITING rows; O1 calls next | 204 no body; no state change | Integration | P1 |
| FLOW-004 | CALLED to SERVING; FR-10, BR-09; AC-14 | O1 starts CALLED entry | 200 SERVING; serviceStartedAt set | Integration | P1 |
| FLOW-005 | Start timestamp stable; FR-10/13, BR-11; AC-14 | Repeat start after successful start | 409 INVALID_STATE_TRANSITION; original timestamp unchanged | Integration | P1 |
| FLOW-006 | SERVING to COMPLETED; FR-11/13, BR-09/11; AC-15 | O1 completes SERVING entry | COMPLETED, completedAt UTC, historical row remains | Integration | P1 |
| FLOW-007 | Completed terminal; FR-11/13, BR-09; AC-15 | Attempt start/complete on COMPLETED | 409; status/timestamps unchanged | Integration | P1 |
| FLOW-008 | Reject out-of-order transitions; FR-12, BR-09; AC-16 | Try WAITING→SERVING, WAITING→COMPLETED, CALLED→COMPLETED | Each 409 INVALID_STATE_TRANSITION; no mutation | Unit + Integration | P1 |
| RBAC-001 | Customer cannot Call Next; FR-03; AC-03/05 | C1 posts Call Next | 403, no entry state changes | Integration | P1 |
| RBAC-002 | Customer cannot Start; FR-03; AC-05 | C1 posts start | 403, no state change | Integration | P1 |
| RBAC-003 | Customer cannot Complete; FR-03; AC-05 | C1 posts complete | 403, no state change | Integration | P1 |
| RBAC-004 | Operator queue assignment; FR-03/08, BR-07; AC-04 | O1 reads Q2 | 403; queue data not returned | Integration | P1 |
| RBAC-005 | Operator mutation assignment; FR-03/09–11; AC-04 | O1 mutates Q2 entry | 403; no state change | Integration | P1 |
| RBAC-006 | Customer cannot read another's detail; FR-07, BR-07; AC-05/10 | C1 requests C2 entry ID | Same 404 as missing; no private data | Integration | P1 |
| RBAC-007 | Role and error contract; FR-12; AC-16 | Exercise malformed ID/body, wrong role, unknown ID, unexpected safe test failure | 400/403/404/500 envelope codes as specified; no internal details | API integration | P1 |
| CONCURRENCY-001 | Concurrent registration numbers; FR-06, BR-03/12; AC-09 | Submit ≥20 parallel joins by distinct customers to one queue | All successful entries have distinct numbers in approved scope | Integration | P1 |
| CONCURRENCY-002 | Duplicate race; FR-05/12, BR-05/12; AC-07/09 | Same customer sends ≥2 simultaneous joins to same queue | Exactly one active entry; loser gets duplicate conflict | Integration | P1 |
| CONCURRENCY-003 | Concurrent Call Next; FR-09, BR-01/12; AC-12 | With ≥2 WAITING entries, send two simultaneous calls | Distinct entries claimed, no duplicate assignment; FIFO among eligible claims | Integration | P1 |
| FLOW-009 | Customer UI end-to-end; FR-01/04/05/07; AC-17 | E2E fixtures: active C1 and OPEN Q1; use browser at 360 px, login, open dashboard, join Q1, open returned entry, refresh | Login/dashboard/join/detail succeed; one persisted WAITING entry and assigned number shown; no other customer data; layout has no page overflow; loading/success/error feedback is accessible | E2E | P1 |
| FLOW-010 | Operator UI end-to-end; FR-01/03/08–11; AC-17 | E2E fixture: O1 assigned Q1 and one WAITING entry; login, open Q1, Call Next, Start, Complete | UI shows allowed actions only and persisted WAITING→CALLED→SERVING→COMPLETED state/timestamps; no page overflow; action feedback accessible | E2E | P1 |

## Coverage and execution guidance

All ACs map to tests: AC-01 AUTH-001–003; AC-02 AUTH-004; AC-03 AUTH-005/RBAC-001–003; AC-04 RBAC-004/005; AC-05 RBAC-001–003/006; AC-06 QUEUE-001; AC-07 QUEUE-002–004/CONCURRENCY-002; AC-08 QUEUE-002/005 and NUMBER-001; AC-09 NUMBER-001/002 and CONCURRENCY-001/002; AC-10 QUEUE-006/RBAC-006; AC-11 QUEUE-007/FLOW-001; AC-12 FLOW-001/002/CONCURRENCY-003; AC-13 FLOW-003; AC-14 FLOW-004/005; AC-15 FLOW-006/007; AC-16 FLOW-008/RBAC-007; AC-17 FLOW-009/010.

Coverage levels: unit tests cover transition and validation functions; DB integration tests cover constraints, transactions and races against the selected database; E2E tests cover customer and operator UI workflows and denial paths. Issue #2 records tooling. Do not substitute mocked concurrency tests for database-backed race tests. Team must resolve the explicitly pending BR/NFR decisions before asserting tests for those policies.
