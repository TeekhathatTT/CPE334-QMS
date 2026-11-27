# Sprint 2 API Specification

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-27 | F-07 contract v1: customer cancellation endpoint, `CANCELLED` status, `cancelledAt` field, operator entry-list filter |

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
