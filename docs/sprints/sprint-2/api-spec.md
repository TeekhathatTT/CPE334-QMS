# Sprint 2 API Specification

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-27 | F-07 contract v1: customer cancellation endpoint, `CANCELLED` status, `cancelledAt` field, operator entry-list filter |
| 2.0 | 2026-11-27 | F-08 contract v1 (issue #41): §7–§11 add the no-show and recover endpoints, the `NO_SHOW` status, the `noShowAt`, `recoveredAt` and `noShowCount` fields and the error code `RECOVERY_LIMIT_REACHED`. §1–§6 (F-07) are unchanged; where F-08 extends them, §7–§11 say so. |
| 3.0 | 2026-11-27 | F-09 contract v1 (issue #42): §12–§16 add the `Counter` resource, additive `counterId` and `counterName` fields on `QueueEntry`, counter list/status/call-next endpoints, and error codes `COUNTER_CLOSED` and `NO_WAITING_ENTRIES`. §1–§11 (F-07, F-08) are unchanged; where F-09 extends them, §12–§16 say so. |
| 3.1 | 2026-11-27 | F-09 contract v1.1 (PR review fixes): documents legacy Call Next as an accepted backwards-compatibility trade-off that explicitly sets `"counterId" = NULL`, and upgrades §16 to the composite FK `("counterId", "serviceQueueId") -> Counter("id", "serviceQueueId")` (`MATCH SIMPLE`, `ON DELETE RESTRICT`). |
| 3.2 | 2026-11-27 | F-09 contract v1.2 alignment: §14.1 `GET /api/operator/queues/{queueId}/counters` returns `404 RESOURCE_NOT_FOUND` for an unknown valid UUIDv4 `queueId` (matching existing `requireQueueAssignment` middleware and `GET /api/operator/queues/{queueId}/entries`). |
| 3.3 | 2026-11-27 | F-09 contract v1.3 (implementation PR review fixes): upgrades §16 composite FK to `ON DELETE RESTRICT ON UPDATE RESTRICT` (`confdeltype = 'r'`, `confupdtype = 'r'`) and clarifies §13 legacy Call Next wording (unmodified server/client regression suites + zero-usable-counter UI fallback `COUNTER-019`). |
| 3.4 | 2026-11-27 | F-08 follows BR-06 (SRS rev. 4.5): §9.2 recover also locks the customer's `User` row first and returns `409 MAX_ACTIVE_ENTRIES_REACHED` when the customer already holds 2 active entries across all queues; §10 updated. (Numbered 3.4 because the F-09 implementation PR uses 3.2 and 3.3.) |
| 4.0 | 2026-11-28 | F-10 contract v1.1 (issue #43, SRS v5.1): §17–§21 add additive `priority` (`"NORMAL" \| "PRIORITY"`) on every `QueueEntry` payload, new `PATCH /api/operator/queue-entries/{entryId}/priority`, explicit body-before-DB validation precedence on `POST /api/queues/{queueId}/entries` (`400`/`403` before `404`/`409`), priority-aware FIFO ordering on counter & legacy Call Next and `aheadCount`, and `WAITING`-only priority ranking on `GET /api/operator/queues/{queueId}/entries`. §1–§16 (F-07, F-08, F-09) unchanged except where §17–§21 extend them. |

This document extends the [Sprint 1 API specification](../sprint-1/api-spec.md). Everything in that document still applies unless a section below says otherwise. Base path, envelopes, timestamps, CSRF and UUID rules are unchanged (Sprint 1 §1, §2, §4, §5). Requirements: [SRS](../../srs.md) v2.0, FR-14, BR-13, BR-14. Design: [F-07 feature SDS](../../features/sprint-2-f07-customer-cancellation.md).

## 1. Changes to standard objects

### 1.1 `QueueEntry` (extends Sprint 1 §3.3)

```json
{
  "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
  "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "queueNumber": 12,
  "status": "CANCELLED",
  "joinedAt": "2026-11-27T09:00:00.000Z",
  "calledAt": null,
  "serviceStartedAt": null,
  "completedAt": null,
  "cancelledAt": "2026-11-27T09:04:12.345Z",
  "aheadCount": 0
}
```

Rules added or changed:
- `status` is one of `WAITING`, `CALLED`, `SERVING`, `COMPLETED`, `CANCELLED`.
- `cancelledAt` is present on **every** `QueueEntry` payload (join, own list, own detail, operator list, call-next, start, complete, cancel). It is `null` unless `status` is `CANCELLED`. RFC 3339 UTC.
- `aheadCount` is `0` when `status` is `CANCELLED` (same rule as any non-`WAITING` status). `CANCELLED` entries are never counted in another entry's `aheadCount`.
- The field is additive. Clients that ignore unknown fields are unaffected.

## 2. Changes to existing endpoints

| Endpoint (Sprint 1 §) | Change |
|---|---|
| `GET /api/me/queue-entries` (§7.3) | May return `CANCELLED` entries; they stay visible as history, like `COMPLETED`. Order unchanged (`joinedAt DESC, id DESC`). |
| `GET /api/me/queue-entries/{entryId}` (§7.4) | May return a `CANCELLED` entry with `aheadCount: 0`. |
| `POST /api/queues/{queueId}/entries` (§7.2) | No code change. After the customer cancels, a new join to the same queue succeeds (BR-05 rev. 2.0) and gets the next number from the queue counter. |
| `GET /api/operator/queues/{queueId}/entries` (§8.2) | **Excludes** entries whose status is `CANCELLED`. Order unchanged (`joinedAt ASC, id ASC`). |
| `POST /api/operator/queues/{queueId}/call-next` (§8.3) | No code change. Only `WAITING` entries are eligible, so `CANCELLED` entries are never called. If every remaining entry is cancelled, the response is `204`. |
| `POST /api/operator/queue-entries/{entryId}/start`, `/complete` (§8.4, §8.5) | No change. A `CANCELLED` entry returns `409 INVALID_STATE_TRANSITION` like any other wrong state. |

## 3. New endpoint

### 3.1 `POST /api/me/queue-entries/{entryId}/cancel`

HTTP method and endpoint: `POST /api/me/queue-entries/{entryId}/cancel`

Purpose: the signed-in customer withdraws their own `WAITING` entry (FR-14).

Request headers:
- `Cookie: <session-cookie>`
- `X-CSRF-Token: <token-from-session>`

Request body: none. A body, if sent, is ignored.

Validation and processing order:
1. `entryId` must be a valid UUIDv4 (`400 INVALID_ARGUMENT` otherwise). This runs as a router parameter check, as on `GET /api/me/queue-entries/{entryId}`.
2. A valid session is required (`401 UNAUTHORIZED`).
3. The role must be `CUSTOMER` (`403 FORBIDDEN`).
4. `X-CSRF-Token` must match the session (`403 FORBIDDEN`), checked before any database read.
5. In one transaction: the entry must exist and belong to the caller (`404 RESOURCE_NOT_FOUND`), and its status must be `WAITING` (`409 INVALID_STATE_TRANSITION`).
6. A conditional update sets `status = CANCELLED` and `cancelledAt = clock_timestamp()` only where `id`, `customerId` match and `status = 'WAITING'`. No row updated → `409 CONCURRENT_MODIFICATION`.
7. The response is sent only after commit.

The queue's availability is not checked. A `CLOSED` queue's entries can be cancelled.

Success response: HTTP `200 OK`

```json
{
  "data": {
    "entry": {
      "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
      "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
      "customerId": "550e8400-e29b-41d4-a716-446655440000",
      "queueNumber": 12,
      "status": "CANCELLED",
      "joinedAt": "2026-11-27T09:00:00.000Z",
      "calledAt": null,
      "serviceStartedAt": null,
      "completedAt": null,
      "cancelledAt": "2026-11-27T09:04:12.345Z",
      "aheadCount": 0
    }
  }
}
```

Error responses (standard error envelope, Sprint 1 §3.4):

| HTTP | Code | Condition | Database change |
|---|---|---|---|
| 400 | `INVALID_ARGUMENT` | `entryId` is not a UUIDv4 | none |
| 401 | `UNAUTHORIZED` | missing, invalid or expired session | none |
| 403 | `FORBIDDEN` | caller's role is not `CUSTOMER` | none |
| 403 | `FORBIDDEN` | `X-CSRF-Token` missing or wrong | none |
| 404 | `RESOURCE_NOT_FOUND` | no entry with that id, **or** the entry belongs to another customer (same body for both) | none |
| 409 | `INVALID_STATE_TRANSITION` | entry status is `CALLED`, `SERVING`, `COMPLETED` or `CANCELLED` | none |
| 409 | `CONCURRENT_MODIFICATION` | entry was `WAITING` when read, but another request changed it before the conditional update | none from this request |
| 500 | `INTERNAL_ERROR` | unexpected failure; transaction rolled back | none |

A repeated cancel of the same entry is **not** idempotent: the second request returns `409 INVALID_STATE_TRANSITION`.

Example (curl, local development, synthetic account; the CSRF value comes from the `qms_csrf` cookie set at login):

```bash
curl -i -X POST "http://localhost:3000/api/me/queue-entries/<entryId>/cancel" \
  -b cookies.txt -H "X-CSRF-Token: <csrf-from-cookie>"
```

## 4. Permission matrix additions (extends System SDS §2)

| Action / endpoint | Anonymous | CUSTOMER | OPERATOR |
|---|---|---|---|
| `POST /api/me/queue-entries/{entryId}/cancel` | `401 UNAUTHORIZED` | May cancel own `WAITING` entry; other customer's or unknown entry `404`; wrong state `409` | `403 FORBIDDEN` |

## 5. Lifecycle and integrity rules (extends Sprint 1 §9)

- Allowed transitions: `WAITING -> CALLED -> SERVING -> COMPLETED` and `WAITING -> CANCELLED`.
- `COMPLETED` and `CANCELLED` are terminal.
- Active states (BR-05) are still `WAITING`, `CALLED`, `SERVING`. The partial unique index `QueueEntry_active_customer_queue_uidx` is unchanged.
- Cancelled rows keep their queue number; numbers are never reused.
- Status and `cancelledAt` are committed atomically.

## 6. Traceability

FR-14, FR-07, FR-08, FR-09, FR-12, FR-13; BR-01, BR-05 (rev.), BR-07, BR-09 (rev.), BR-10, BR-11, BR-12, BR-13, BR-14; AC-17–AC-24. Tests: [tests.md](./tests.md).

---

# F-08 No-show handling and recovery (v2.0)

Requirements: [SRS](../../srs.md) v3.0, FR-15, FR-16, BR-15, BR-16, BR-17, AC-25–AC-34. Design: [F-08 feature SDS](../../features/sprint-2-f08-no-show-recovery.md).

## 7. Changes to standard objects (F-08)

### 7.1 `QueueEntry` (extends §1.1)

```json
{
  "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
  "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "queueNumber": 7,
  "status": "NO_SHOW",
  "joinedAt": "2026-11-27T09:00:00.000Z",
  "calledAt": "2026-11-27T09:10:00.000Z",
  "serviceStartedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "noShowAt": "2026-11-27T09:13:30.120Z",
  "recoveredAt": null,
  "noShowCount": 1
}
```

Rules added or changed:
- `status` is one of `WAITING`, `CALLED`, `SERVING`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.
- `noShowAt`, `recoveredAt` and `noShowCount` are present on **every** `QueueEntry` payload. `noShowAt` is the time of the latest no-show, `recoveredAt` the time of the return, both RFC 3339 UTC or `null`. `noShowCount` is an integer 0, 1 or 2.
- `aheadCount` is `0` when `status` is `NO_SHOW`. `NO_SHOW` entries are never counted in another entry's `aheadCount`.
- After a return the entry is `WAITING` with `calledAt` `null`, `noShowAt` and `recoveredAt` set and `noShowCount` 1. Its `joinedAt` and `queueNumber` are the original ones.
- The fields are additive. Clients that ignore unknown fields are unaffected.

## 8. Changes to existing endpoints (F-08)

| Endpoint | Change |
|---|---|
| `GET /api/me/queue-entries`, `GET /api/me/queue-entries/{entryId}` | May return `NO_SHOW` entries (`aheadCount` `0` on the detail). No code change besides the new fields. |
| `POST /api/queues/{queueId}/entries` | No code change. A `NO_SHOW` entry is not active, so the customer may join the same queue again (BR-05 rev. 3.0). |
| `POST /api/me/queue-entries/{entryId}/cancel` (§3.1) | No code change. A `NO_SHOW` entry returns `409 INVALID_STATE_TRANSITION`. A returned (`WAITING`) entry can be cancelled. |
| `GET /api/operator/queues/{queueId}/entries` | No code change. `NO_SHOW` entries **are included**, in the same `joinedAt ASC, id ASC` order (only `CANCELLED` is excluded, §2). |
| `POST /api/operator/queues/{queueId}/call-next` | No code change. Only `WAITING` is eligible; `NO_SHOW` entries are never called. A returned entry is eligible again at its original position. |
| `POST /api/operator/queue-entries/{entryId}/start`, `/complete` | No change. A `NO_SHOW` entry returns `409 INVALID_STATE_TRANSITION`. |

## 9. New endpoints (F-08)

### 9.1 `POST /api/operator/queue-entries/{entryId}/no-show`

Purpose: an operator assigned to the entry's queue records that the called customer did not come (FR-15).

Request headers: `Cookie: <session-cookie>`, `X-CSRF-Token: <token-from-session>`. Request body: none (ignored if sent).

Validation and processing order (same as Start, Sprint 1 §8.4):
1. `entryId` must be a valid UUIDv4 (`400 INVALID_ARGUMENT`).
2. A valid session is required (`401 UNAUTHORIZED`).
3. `X-CSRF-Token` must match the session (`403 FORBIDDEN`).
4. The role must be `OPERATOR` (`403 FORBIDDEN`).
5. In one transaction: lock the entry (`FOR UPDATE`); it must exist (`404 RESOURCE_NOT_FOUND`); the caller must be assigned to its queue (`403 FORBIDDEN`); its status must be `CALLED` (`409 INVALID_STATE_TRANSITION`).
6. Update `status = NO_SHOW`, `noShowAt = clock_timestamp()`, `noShowCount = noShowCount + 1`. `calledAt` is kept.
7. The response is sent only after commit.

Queue availability is not checked.

Success: `200 OK`, `{ "data": { "entry": <QueueEntry> } }` with `status` `NO_SHOW` (example in §7.1).

| HTTP | Code | Condition | Database change |
|---|---|---|---|
| 400 | `INVALID_ARGUMENT` | `entryId` is not a UUIDv4 | none |
| 401 | `UNAUTHORIZED` | missing, invalid or expired session | none |
| 403 | `FORBIDDEN` | CSRF missing or wrong; role is not `OPERATOR`; operator not assigned to the entry's queue | none |
| 404 | `RESOURCE_NOT_FOUND` | no entry with that id | none |
| 409 | `INVALID_STATE_TRANSITION` | status is `WAITING`, `SERVING`, `COMPLETED`, `CANCELLED` or `NO_SHOW` | none |
| 500 | `INTERNAL_ERROR` | unexpected failure; rolled back | none |

### 9.2 `POST /api/operator/queue-entries/{entryId}/recover`

Purpose: an operator assigned to the entry's queue returns a `NO_SHOW` entry to the queue at its original position, once (FR-16).

Request headers and body: as §9.1.

Validation and processing order:
1. – 4. as §9.1.
5. In one transaction: read the entry (`404 RESOURCE_NOT_FOUND` if missing); lock the customer's `User` row (`FOR NO KEY UPDATE`, the lock join takes first since BR-06, rev. 3.4); lock its queue row (`FOR UPDATE`, the same lock join takes); lock the entry (`FOR UPDATE`).
6. The caller must be assigned to the entry's queue (`403 FORBIDDEN`).
7. Status must be `NO_SHOW` (`409 INVALID_STATE_TRANSITION`).
8. `noShowCount` must be 1 (`409 RECOVERY_LIMIT_REACHED` when it is 2).
9. The customer must have no other `WAITING`, `CALLED` or `SERVING` entry in the same queue (`409 DUPLICATE_ACTIVE_ENTRY`).
9a. The customer must hold fewer than 2 `WAITING`, `CALLED` or `SERVING` entries across all queues (`409 MAX_ACTIVE_ENTRIES_REACHED`, BR-06, rev. 3.4).
10. Update `status = WAITING`, `calledAt = NULL`, `recoveredAt = clock_timestamp()`. `joinedAt`, `queueNumber`, `noShowAt` and `noShowCount` are kept.
11. The response is sent only after commit.

Queue availability is not checked.

Success: `200 OK`

```json
{
  "data": {
    "entry": {
      "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
      "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
      "customerId": "550e8400-e29b-41d4-a716-446655440000",
      "queueNumber": 7,
      "status": "WAITING",
      "joinedAt": "2026-11-27T09:00:00.000Z",
      "calledAt": null,
      "serviceStartedAt": null,
      "completedAt": null,
      "cancelledAt": null,
      "noShowAt": "2026-11-27T09:13:30.120Z",
      "recoveredAt": "2026-11-27T09:20:02.004Z",
      "noShowCount": 1
    }
  }
}
```

| HTTP | Code | Condition | Database change |
|---|---|---|---|
| 400 | `INVALID_ARGUMENT` | `entryId` is not a UUIDv4 | none |
| 401 | `UNAUTHORIZED` | missing, invalid or expired session | none |
| 403 | `FORBIDDEN` | CSRF missing or wrong; role is not `OPERATOR`; operator not assigned | none |
| 404 | `RESOURCE_NOT_FOUND` | no entry with that id | none |
| 409 | `INVALID_STATE_TRANSITION` | status is not `NO_SHOW` | none |
| 409 | `RECOVERY_LIMIT_REACHED` | `noShowCount` is 2 (the entry was already returned once) | none |
| 409 | `DUPLICATE_ACTIVE_ENTRY` | the customer already has another active entry in that queue | none |
| 409 | `MAX_ACTIVE_ENTRIES_REACHED` | the customer already holds 2 active entries across all queues (BR-06, rev. 3.4) | none |
| 500 | `INTERNAL_ERROR` | unexpected failure; rolled back | none |

Example (curl, local development, synthetic account):

```bash
curl -i -X POST "http://localhost:3000/api/operator/queue-entries/<entryId>/no-show" \
  -b cookies.txt -H "X-CSRF-Token: <csrf-from-cookie>"
curl -i -X POST "http://localhost:3000/api/operator/queue-entries/<entryId>/recover" \
  -b cookies.txt -H "X-CSRF-Token: <csrf-from-cookie>"
```

## 10. Permission matrix additions (F-08)

| Action / endpoint | Anonymous | CUSTOMER | OPERATOR not assigned | OPERATOR assigned |
|---|---|---|---|---|
| `POST /api/operator/queue-entries/{entryId}/no-show` | `401` | `403` (owner included) | `403` | `CALLED` → `200`; other status `409` |
| `POST /api/operator/queue-entries/{entryId}/recover` | `401` | `403` (owner included) | `403` | `NO_SHOW` count 1 → `200`; count 2 `409 RECOVERY_LIMIT_REACHED`; other active entry `409 DUPLICATE_ACTIVE_ENTRY`; customer already holds 2 active entries `409 MAX_ACTIVE_ENTRIES_REACHED` (rev. 3.4); other status `409 INVALID_STATE_TRANSITION` |

## 11. Lifecycle and integrity rules (extends §5)

- Allowed transitions: those in §5, plus `CALLED -> NO_SHOW` and `NO_SHOW -> WAITING` (only when `noShowCount` = 1).
- `NO_SHOW` is not active. `NO_SHOW` with `noShowCount` 2 is final.
- Active states are still `WAITING`, `CALLED`, `SERVING`; the partial unique index is unchanged.
- `noShowCount` is kept in 0–2 by the database constraint `QueueEntry_noShowCount_range_check`.
- Status, timestamps and `noShowCount` are committed atomically. Queue numbers are never reused.

Traceability: FR-15, FR-16, FR-03, FR-07, FR-08, FR-09, FR-12, FR-13; BR-01, BR-05 (rev. 3.0), BR-07, BR-09 (rev. 3.0), BR-10, BR-11, BR-12, BR-15, BR-16, BR-17; AC-25–AC-34. Tests: [tests.md §7](./tests.md#7-f-08-no-show-handling-and-recovery).

---

# F-09 Multi-counter support (v3.0)

Requirements: [SRS](../../srs.md) v4.0, FR-17–FR-19, BR-18–BR-20, AC-35–AC-44. Design: [F-09 feature SDS](../../features/sprint-2-f09-multi-counter.md).

## 12. Standard objects (F-09)

### 12.1 `Counter` (new)

```json
{
  "id": "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  "serviceQueueId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "name": "Counter 1",
  "status": "OPEN",
  "assignedOperatorId": null,
  "createdAt": "2026-11-27T09:00:00.000Z",
  "updatedAt": "2026-11-27T09:00:00.000Z"
}
```

Field rules:
- `id`, `serviceQueueId`: UUIDv4 strings.
- `name`: non-empty string (max 80 chars), unique within `serviceQueueId`.
- `status`: `"OPEN"` or `"CLOSED"`.
- `assignedOperatorId`: UUIDv4 string of a specific `OPERATOR` user, or `null` (meaning any operator assigned to `serviceQueueId` may operate the counter).
- `createdAt`, `updatedAt`: RFC 3339 UTC timestamps ending in `Z`.

### 12.2 `QueueEntry` (extends §7.1)

```json
{
  "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
  "serviceQueueId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "customerId": "11111111-1111-4111-8111-111111111111",
  "queueNumber": 7,
  "status": "CALLED",
  "joinedAt": "2026-11-27T09:00:00.000Z",
  "calledAt": "2026-11-27T09:10:00.000Z",
  "serviceStartedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "noShowAt": null,
  "recoveredAt": null,
  "noShowCount": 0,
  "counterId": "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  "counterName": "Counter 1"
}
```

Rules added or changed:
- `counterId` (`string | null`) and `counterName` (`string | null`) are present on **every** serialized `QueueEntry` payload (join, own list, own detail, cancel, operator list, legacy call-next, counter call-next, start, complete, no-show, recover).
- Both fields are `null` for `WAITING` and `CANCELLED` entries, and for entries called via legacy `POST /api/operator/queues/{queueId}/call-next`.
- Both fields are non-null when called via `POST /api/operator/counters/{counterId}/call-next`, and are preserved across `CALLED -> SERVING -> COMPLETED` and `CALLED -> NO_SHOW`.
- Both fields are additive; clients that ignore unknown fields are unaffected.

## 13. Changes to existing endpoints (F-09)

| Endpoint | Change |
|---|---|
| `GET /api/me/queue-entries`, `GET /api/me/queue-entries/{entryId}`, `POST /api/queues/{queueId}/entries`, `POST /api/me/queue-entries/{entryId}/cancel` | Additive `counterId` and `counterName` included in every returned `QueueEntry`. Join and cancel always return `counterId: null, counterName: null`. |
| `GET /api/operator/queues/{queueId}/entries` | Additive `counterId` and `counterName` included in every returned `QueueEntry`. Order (`joinedAt ASC, id ASC`) and `CANCELLED` exclusion unchanged. |
| `POST /api/operator/queues/{queueId}/call-next` (legacy) | **Preserved as an explicit backwards-compatibility trade-off (v3.1 / v3.3):** `BR-19` applies to counter-scoped Call Next; retaining this legacy endpoint without counter `OPEN`/`assignedOperatorId` checks is explicitly accepted to preserve unmodified Sprint 1 / F-07 / F-08 server and client regression suites and the zero-usable-counter UI fallback (`COUNTER-019`; deprecation/removal deferred to a future sprint). Its `UPDATE` statement **must** explicitly set `"counterId" = NULL` so it never leaves a stale `counterId` on a newly `CALLED` entry; FIFO ordering, `FOR UPDATE SKIP LOCKED`, `counterId: null`, `counterName: null`, and `204 No Content` when empty (BR-10) remain unchanged. |
| `POST /api/operator/queue-entries/{entryId}/start`, `/complete`, `/no-show` | Transition logic unchanged; entries retain their existing `counterId` and return `counterId` and `counterName` in the response. Succeeds even if the assigned counter was subsequently set to `CLOSED` (BR-19). |
| `POST /api/operator/queue-entries/{entryId}/recover` (§9.2) | Clears `counterId = NULL` alongside `calledAt = NULL` when transitioning `NO_SHOW -> WAITING` (BR-16 rev. 4.0, BR-20); response returns `counterId: null, counterName: null`. |

## 14. New endpoints (F-09)

### 14.1 `GET /api/operator/queues/{queueId}/counters`

Purpose: list all counters belonging to an assigned service queue in deterministic order (FR-17).

Request headers:
- `Cookie: <session-cookie>`

Validation and processing order:
1. `queueId` must be a valid UUIDv4 (`400 INVALID_ARGUMENT`).
2. Valid session required (`401 UNAUTHORIZED`).
3. Role must be `OPERATOR` (`403 FORBIDDEN`).
4. `requireQueueAssignment` checks that `queueId` exists (`404 RESOURCE_NOT_FOUND` if missing) and that the operator is assigned to `queueId` (`403 FORBIDDEN` if unassigned), matching `GET /api/operator/queues/{queueId}/entries`.
5. Query `Counter` where `serviceQueueId = queueId`, ordered by `name ASC, id ASC`.

Success response: `200 OK`

```json
{
  "data": {
    "counters": [
      {
        "id": "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
        "serviceQueueId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "name": "Counter 1",
        "status": "OPEN",
        "assignedOperatorId": null,
        "createdAt": "2026-11-27T09:00:00.000Z",
        "updatedAt": "2026-11-27T09:00:00.000Z"
      },
      {
        "id": "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
        "serviceQueueId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "name": "Counter 2",
        "status": "OPEN",
        "assignedOperatorId": null,
        "createdAt": "2026-11-27T09:00:00.000Z",
        "updatedAt": "2026-11-27T09:00:00.000Z"
      }
    ]
  }
}
```

Error responses:

| HTTP | Code | Condition | Database change |
|---|---|---|---|
| 400 | `INVALID_ARGUMENT` | `queueId` is not a UUIDv4 | none |
| 401 | `UNAUTHORIZED` | missing, invalid or expired session | none |
| 403 | `FORBIDDEN` | role is not `OPERATOR`, or operator not assigned to `queueId` | none |
| 404 | `RESOURCE_NOT_FOUND` | no service queue with that `queueId` | none |
| 500 | `INTERNAL_ERROR` | unexpected server failure | none |

### 14.2 `PATCH /api/operator/counters/{counterId}/status`

Purpose: open or close a service counter (FR-17).

Request headers:
- `Cookie: <session-cookie>`
- `X-CSRF-Token: <token-from-session>`
- `Content-Type: application/json`

Request body (strictly validated; unknown/missing/invalid fields rejected with `400 INVALID_ARGUMENT`):

```json
{
  "status": "CLOSED"
}
```

Allowed values for `status`: `"OPEN"` | `"CLOSED"`.

Validation and processing order:
1. `counterId` must be a valid UUIDv4 (`400 INVALID_ARGUMENT`).
2. Valid session required (`401 UNAUTHORIZED`).
3. `X-CSRF-Token` must match the session (`403 FORBIDDEN`).
4. Role must be `OPERATOR` (`403 FORBIDDEN`).
5. Validate JSON body (`{ status: "OPEN" | "CLOSED" }` strictly; `400 INVALID_ARGUMENT` otherwise).
6. In one transaction: lock `Counter` `FOR UPDATE` (`404 RESOURCE_NOT_FOUND` if missing); verify `OperatorAssignment` for `(caller, counter.serviceQueueId)` and verify `counter.assignedOperatorId === null || counter.assignedOperatorId === caller` (`403 FORBIDDEN` otherwise); update `status` and `updatedAt`.
7. Commit before responding. Setting the same status again is idempotent and returns `200 OK`. Parent queue availability is not checked.

Success response: `200 OK`, `{ "data": { "counter": <Counter> } }`.

Error responses:

| HTTP | Code | Condition | Database change |
|---|---|---|---|
| 400 | `INVALID_ARGUMENT` | `counterId` is not a UUIDv4, or request body fails schema validation | none |
| 401 | `UNAUTHORIZED` | missing, invalid or expired session | none |
| 403 | `FORBIDDEN` | CSRF missing/wrong; role not `OPERATOR`; operator not assigned to counter's queue; or `assignedOperatorId` is non-null and ≠ caller | none |
| 404 | `RESOURCE_NOT_FOUND` | no counter with that id | none |
| 500 | `INTERNAL_ERROR` | unexpected failure; rolled back | none |

### 14.3 `POST /api/operator/counters/{counterId}/call-next`

Purpose: atomically call the oldest eligible `WAITING` entry in the counter's queue and assign it to that `OPEN` counter (FR-18).

Request headers:
- `Cookie: <session-cookie>`
- `X-CSRF-Token: <token-from-session>`

Request body: none (ignored if sent).

Validation and processing order:
1. `counterId` must be a valid UUIDv4 (`400 INVALID_ARGUMENT`).
2. Valid session required (`401 UNAUTHORIZED`).
3. `X-CSRF-Token` must match the session (`403 FORBIDDEN`).
4. Role must be `OPERATOR` (`403 FORBIDDEN`).
5. In one transaction:
   a. Lock `Counter` row `FOR UPDATE`; missing → `404 RESOURCE_NOT_FOUND`.
   b. Verify `OperatorAssignment` for `(caller, counter.serviceQueueId)` and verify `counter.assignedOperatorId === null || counter.assignedOperatorId === caller`; otherwise → `403 FORBIDDEN`.
   c. Verify `counter.status === 'OPEN'`; if `CLOSED` → `409 COUNTER_CLOSED`.
   d. Select oldest unlocked `WAITING` entry in `counter.serviceQueueId` (`ORDER BY "joinedAt" ASC, "id" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`); if none → `409 NO_WAITING_ENTRIES`.
   e. Update claimed entry: `status = CALLED`, `calledAt = clock_timestamp()`, `counterId = counter.id`.
6. Commit before responding. Parent queue availability is not checked.

Success response: `200 OK`, `{ "data": { "entry": <QueueEntry> } }` with `status: "CALLED"`, `counterId: counter.id`, and `counterName: counter.name` (example in §12.2).

Error responses:

| HTTP | Code | Condition | Database change |
|---|---|---|---|
| 400 | `INVALID_ARGUMENT` | `counterId` is not a UUIDv4 | none |
| 401 | `UNAUTHORIZED` | missing, invalid or expired session | none |
| 403 | `FORBIDDEN` | CSRF missing/wrong; role not `OPERATOR`; operator not assigned to counter's queue; or `assignedOperatorId` is non-null and ≠ caller | none |
| 404 | `RESOURCE_NOT_FOUND` | no counter with that id | none |
| 409 | `COUNTER_CLOSED` | counter's `status` is `CLOSED` | none |
| 409 | `NO_WAITING_ENTRIES` | no eligible `WAITING` entry exists in the counter's queue | none |
| 500 | `INTERNAL_ERROR` | unexpected failure; rolled back | none |

Example (curl, local development, synthetic account):

```bash
curl -i -b cookies.txt "http://localhost:3000/api/operator/queues/<queueId>/counters"

curl -i -X PATCH "http://localhost:3000/api/operator/counters/<counterId>/status" \
  -b cookies.txt -H "X-CSRF-Token: <csrf-from-cookie>" -H "Content-Type: application/json" \
  -d '{"status":"CLOSED"}'

curl -i -X POST "http://localhost:3000/api/operator/counters/<counterId>/call-next" \
  -b cookies.txt -H "X-CSRF-Token: <csrf-from-cookie>"
```

## 15. Permission matrix additions (F-09)

| Action / endpoint | Anonymous | CUSTOMER | OPERATOR not assigned | OPERATOR assigned (mismatched `assignedOperatorId`) | OPERATOR assigned (`assignedOperatorId` null or self) |
|---|---|---|---|---|---|
| `GET /api/operator/queues/{queueId}/counters` | `401` | `403` | `403` | `200` (lists queue's counters) | `200` |
| `PATCH /api/operator/counters/{counterId}/status` | `401` | `403` | `403` | `403` | `200` (valid body); `400` (invalid body) |
| `POST /api/operator/counters/{counterId}/call-next` | `401` | `403` | `403` | `403` | `200` (`OPEN` + waiting); `409 COUNTER_CLOSED`; `409 NO_WAITING_ENTRIES` |

## 16. Lifecycle and integrity rules (extends §11)

- `QueueStatus` values and transitions are unchanged from §11; F-09 adds `Counter.status` (`OPEN` ↔ `CLOSED`).
- Every `Counter` name is unique per `ServiceQueue` (`Counter_serviceQueueId_name_key`), and `(id, serviceQueueId)` has a unique constraint (`Counter_id_serviceQueueId_key`).
- `QueueEntry.counterId` is nullable and enforced at the database layer by the composite FK `FOREIGN KEY ("counterId", "serviceQueueId") REFERENCES "Counter"("id", "serviceQueueId") ON DELETE RESTRICT ON UPDATE RESTRICT` (`MATCH SIMPLE`, default): `counterId IS NULL` is permitted (for `WAITING`, `CANCELLED`, and legacy calls), while any non-null `counterId` belonging to a different `serviceQueueId` and any `UPDATE` of `Counter.serviceQueueId` while referenced are rejected by PostgreSQL. `WAITING` and `CANCELLED` rows (including after F-08 recovery) always have `counterId = NULL`.
- Counter lock precedes entry lock (`Counter` `FOR UPDATE` → `QueueEntry` `FOR UPDATE SKIP LOCKED`), preserving a deadlock-free lock order across all endpoints.

Traceability: FR-17–FR-19, FR-03, FR-07–FR-13, FR-16; BR-01, BR-07, BR-10 (rev. 4.0), BR-11, BR-12, BR-16 (rev. 4.0), BR-18–BR-20; AC-35–AC-44. Tests: [tests.md §8](./tests.md#8-f-09-multi-counter-support).

---

# F-10 Priority queue policy (v4.0)

Requirements: [SRS](../../srs.md) v5.1 §1.4, FR-20–FR-22, BR-01 (rev. 5.0), BR-16 (rev. 5.0), BR-19 (rev. 5.0), BR-21–BR-23, §10.3 (AC-46–AC-55). Design: [F-10 feature SDS](../../features/sprint-2-f10-priority-queue-policy.md) v1.1.

## 17. Changes to standard objects (F-10)

### 17.1 `QueueEntry` (extends §12.2)

```json
{
  "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
  "serviceQueueId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "customerId": "11111111-1111-4111-8111-111111111111",
  "queueNumber": 7,
  "status": "WAITING",
  "priority": "PRIORITY",
  "joinedAt": "2026-11-28T09:00:00.000Z",
  "calledAt": null,
  "serviceStartedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "noShowAt": null,
  "recoveredAt": null,
  "noShowCount": 0,
  "counterId": null,
  "counterName": null,
  "aheadCount": 0
}
```

Rules added:
- `priority` (`"NORMAL" | "PRIORITY"`) is present on **every** serialized `QueueEntry` payload (join, own list, own detail, cancel, operator list, legacy call-next, counter call-next, start, complete, no-show, recover, and priority update).
- Defaults to `"NORMAL"` on every newly created entry (`POST /api/queues/{queueId}/entries`).
- Additive field; clients that ignore unknown fields are unaffected.

## 18. Changes to existing endpoints (F-10)

| Endpoint | Change |
|---|---|
| `POST /api/queues/{queueId}/entries` | Always creates `WAITING` entries with `priority: "NORMAL"`. **Deterministic validation order (body validation runs BEFORE DB lookups):**<br>1. `validateUuidParam('queueId')` (`400 INVALID_ARGUMENT`)<br>2. `requireAuth` (`401 UNAUTHORIZED`)<br>3. `requireRole(CUSTOMER)` (`403 FORBIDDEN`)<br>4. `requireCsrf` (`403 FORBIDDEN`)<br>5. **Request-body `priority` check (before DB lookup):** malformed JSON or any `priority` value other than `"NORMAL"` or `"PRIORITY"` (e.g., `"HIGH"`, `123`, `null`, `""`) → `400 INVALID_ARGUMENT`; literal `{"priority":"PRIORITY"}` → `403 FORBIDDEN` (customer self-elevation blocked server-side, even if `:queueId` does not exist or is `CLOSED`); omitted/empty body or literal `{"priority":"NORMAL"}` proceeds.<br>6. DB transaction checks: `404 RESOURCE_NOT_FOUND` → `409 QUEUE_NOT_AVAILABLE` → `409 DUPLICATE_ACTIVE_ENTRY` (BR-05) → `409 MAX_ACTIVE_ENTRIES_REACHED` (BR-06) → `201 Created` (`priority: "NORMAL"`). |
| `POST /api/operator/counters/{counterId}/call-next` (F-09) | Ordering updated to explicit priority-aware FIFO: `ORDER BY (CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC, "joinedAt" ASC, "id" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`. Response includes `priority`. |
| `POST /api/operator/queues/{queueId}/call-next` (legacy F-05) | Ordering updated identically to `(CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC, "joinedAt" ASC, "id" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`; keeps `counterId: null` and `204 No Content` when empty. Response includes `priority`. |
| `GET /api/operator/queues/{queueId}/entries` | Priority ranking applies **only to `WAITING` entries**: `ORDER BY (CASE WHEN "status" = 'WAITING'::"QueueStatus" AND "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC, "joinedAt" ASC, "id" ASC`. Non-`WAITING` entries (`CALLED`, `SERVING`, `NO_SHOW`, `COMPLETED`) retain strict chronological `joinedAt ASC, id ASC` ordering; `CANCELLED` exclusion unchanged. Response includes `priority`. |
| `GET /api/me/queue-entries/{entryId}` | `computeAheadCount` counts only `WAITING` entries in the same queue strictly ahead under `(priority_rank ASC, joinedAt ASC, id ASC)` (non-monotonic for `NORMAL` entries when another waiting entry is promoted). Response includes `priority`. |
| `GET /api/me/queue-entries`, `POST /api/me/queue-entries/{entryId}/cancel`, `POST /api/operator/queue-entries/{entryId}/{start,complete,no-show,recover}` | Transition logic unchanged; `recoverNoShowEntry` (F-08) **preserves** `priority` when returning `NO_SHOW -> WAITING`; every returned `QueueEntry` includes additive `priority`. |

## 19. New endpoint (F-10)

### 19.1 `PATCH /api/operator/queue-entries/{entryId}/priority`

Purpose: update the priority (`NORMAL` ↔ `PRIORITY`) of a `WAITING` queue entry in an assigned queue (FR-20).

Request headers:
- `Cookie: <session-cookie>`
- `X-CSRF-Token: <token-from-session>`
- `Content-Type: application/json`

Request body (strictly validated; unknown/missing/invalid fields rejected with `400 INVALID_ARGUMENT`):

```json
{
  "priority": "PRIORITY"
}
```

Allowed values for `priority`: `"NORMAL"` | `"PRIORITY"`.

Validation and processing order:
1. `entryId` must be a valid UUIDv4 (`400 INVALID_ARGUMENT`).
2. Valid session required (`401 UNAUTHORIZED`).
3. `X-CSRF-Token` must match the session (`403 FORBIDDEN`).
4. Role must be `OPERATOR` (`403 FORBIDDEN` for `CUSTOMER`, including the entry's owner; no `ADMIN` role exists).
5. Validate JSON body (`z.object({ priority: z.enum(['NORMAL', 'PRIORITY']) }).strict()`; `400 INVALID_ARGUMENT` otherwise).
6. In one transaction:
   a. Lock entry row `SELECT "id", "serviceQueueId", "status", "priority" FROM "QueueEntry" WHERE "id" = $1::uuid FOR UPDATE`; missing → `404 RESOURCE_NOT_FOUND`.
   b. Verify `OperatorAssignment` for `(caller, entry.serviceQueueId)`; missing → `403 FORBIDDEN`.
   c. Verify `entry.status === 'WAITING'`; otherwise (`CALLED`, `SERVING`, `COMPLETED`, `CANCELLED`, `NO_SHOW`) → `409 INVALID_STATE_TRANSITION`.
   d. Update `priority = body.priority` (idempotent if already equal; `joinedAt`, `queueNumber`, `status`, and all timestamps unchanged).
7. Commit before responding. Parent queue availability (`OPEN`/`CLOSED`) is not checked (AD-05).

Success response: `200 OK`, `{ "data": { "entry": <QueueEntry> } }`.

Error responses:

| HTTP | Code | Condition | Database change |
|---|---|---|---|
| 400 | `INVALID_ARGUMENT` | `entryId` is not a UUIDv4, or request body fails strict schema validation | none |
| 401 | `UNAUTHORIZED` | missing, invalid or expired session | none |
| 403 | `FORBIDDEN` | CSRF missing/wrong; role not `OPERATOR`; or operator not assigned to entry's queue | none |
| 404 | `RESOURCE_NOT_FOUND` | no queue entry with that id | none |
| 409 | `INVALID_STATE_TRANSITION` | entry status is not `WAITING` | none |
| 500 | `INTERNAL_ERROR` | unexpected failure; rolled back | none |

Example (curl, local development, synthetic account):

```bash
curl -i -X PATCH "http://localhost:3000/api/operator/queue-entries/<entryId>/priority" \
  -b cookies.txt -H "X-CSRF-Token: <csrf-from-cookie>" -H "Content-Type: application/json" \
  -d '{"priority":"PRIORITY"}'
```

## 20. Permission matrix additions (F-10)

| Action / endpoint | Anonymous | CUSTOMER | OPERATOR not assigned | OPERATOR assigned |
|---|---|---|---|---|
| `PATCH /api/operator/queue-entries/{entryId}/priority` | `401` | `403` | `403` | `200` (`WAITING` + valid body); `400` (invalid body); `409 INVALID_STATE_TRANSITION` (non-`WAITING`) |
| `POST /api/queues/{queueId}/entries` with `{"priority":"PRIORITY"}` | `401` | `403` (before DB lookups) | `403` (role) | `403` (role) |
| `POST /api/queues/{queueId}/entries` with malformed `priority` | `401` | `400` (before DB lookups) | `403` (role) | `403` (role) |

## 21. Lifecycle, ordering and integrity rules (extends §16)

- `QueueStatus` values and transitions are unchanged; F-10 adds `QueuePriority` (`NORMAL`, `PRIORITY`) with `NOT NULL DEFAULT 'NORMAL'` on `QueueEntry.priority`.
- Explicit SQL sort key `(CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC, "joinedAt" ASC, "id" ASC` guarantees `PRIORITY` precedes `NORMAL` regardless of PostgreSQL enum declaration order, backed by partial expression index `QueueEntry_waiting_priority_fifo_idx` on `WAITING` entries.
- `PATCH .../priority` acquires only a single `QueueEntry` `FOR UPDATE` row lock (matching Start/Complete/No-show), preserving the acyclic lock order across all endpoints. Under `FOR UPDATE SKIP LOCKED`, a concurrent Call Next skips a row locked by `PATCH .../priority` (returning `409 NO_WAITING_ENTRIES` / `204` if it is the sole `WAITING` entry).

Traceability: FR-20–FR-22, FR-03, FR-05, FR-07–FR-16, FR-18–FR-19; BR-01 (rev. 5.0), BR-16 (rev. 5.0), BR-19 (rev. 5.0), BR-21–BR-23; AC-46–AC-55. Tests: [tests.md §9](./tests.md#9-f-10-priority-queue-policy).
