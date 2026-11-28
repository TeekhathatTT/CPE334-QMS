# Sprint 3 API Specification

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-28 | @TeekhathatTT (review: @Khwanklao, pending) | First Sprint 3 contract (issue #44): F-11 analytics endpoint, F-12 booking endpoints and F-13 login throttling and response headers. Aligned with SRS v6.0. |

## 1. Conventions (unchanged from Sprint 1 and Sprint 2)

- JSON bodies, an envelope of `{ "data": … }` on success and `{ "error": { "code", "message", "requestId" } }` on failure.
- Cookie session authentication. State-changing requests need `X-CSRF-Token` (AD-01).
- Path UUIDs are validated first (`400 INVALID_ARGUMENT`). Then come authentication (`401`), role (`403`), queue existence (`404`) and assignment (`403`), exactly as for `GET /api/operator/queues/{queueId}/entries`.
- Timestamps are ISO 8601 UTC strings. Calendar dates are `YYYY-MM-DD` in `Asia/Bangkok`.

## 2. F-11 Operational analytics

### 2.1 `GET /api/operator/queues/{queueId}/analytics`

| Item | Value |
|---|---|
| Role | `OPERATOR` assigned to `queueId` |
| CSRF | not required (safe read) |
| Query | `from` (required, `YYYY-MM-DD`), `to` (required, `YYYY-MM-DD`). There are no other parameters. |
| Validation | strict pattern, a real calendar date, `from ≤ to`, `to − from ≤ 30` days (inclusive span ≤ 31). Any unknown parameter fails. |
| Side effects | none (no row is created or changed) |

**200 OK**

```json
{
  "data": {
    "analytics": {
      "queueId": "uuid",
      "queueName": "General Inquiry Desk",
      "from": "2026-11-20",
      "to": "2026-11-26",
      "timezone": "Asia/Bangkok",
      "volumes": {
        "joined": 9, "waiting": 1, "called": 1, "serving": 1,
        "completed": 4, "cancelled": 1, "noShow": 1,
        "recovered": 1, "priority": 1
      },
      "waitTime":    { "count": 7, "averageSeconds": 351.4, "medianSeconds": 300.0, "p90Seconds": 720.0, "maxSeconds": 900.0 },
      "serviceTime": { "count": 4, "averageSeconds": 570.0, "medianSeconds": 540.0, "p90Seconds": 810.0, "maxSeconds": 900.0 },
      "daily": [
        { "date": "2026-11-20", "joined": 2, "completed": 2, "cancelled": 0, "noShow": 0, "averageWaitSeconds": 210.0, "averageServiceSeconds": 450.0 }
      ]
    }
  }
}
```

Field rules (BR-24 to BR-26):

| Field | Rule |
|---|---|
| `volumes.*` | Counts of cohort entries (`joinedAt` in range) by current `status`. `waiting + called + serving + completed + cancelled + noShow = joined`. `recovered` counts entries with `recoveredAt` set; `priority` counts entries with `priority = PRIORITY`. |
| `waitTime` | Over cohort entries with `calledAt` set: `calledAt − joinedAt` in seconds. |
| `serviceTime` | Over `COMPLETED` cohort entries: `completedAt − serviceStartedAt` in seconds. |
| `averageSeconds`, `medianSeconds`, `p90Seconds`, `maxSeconds` | Numbers rounded half-up to 1 decimal. Percentiles use linear interpolation (`percentile_cont`). All four are `null` when `count = 0`. |
| `daily[]` | Exactly one row per date from `from` to `to`, ascending. `joined`, `completed`, `cancelled` and `noShow` count cohort entries that joined on that date. `averageWaitSeconds` and `averageServiceSeconds` are averages over that date's entries, or `null`. |

**Errors**

| Case | Status | Code |
|---|---|---|
| Malformed `queueId` | 400 | `INVALID_ARGUMENT` |
| No session | 401 | `UNAUTHORIZED` |
| `CUSTOMER` | 403 | `FORBIDDEN` |
| Unknown queue | 404 | `RESOURCE_NOT_FOUND` |
| Operator not assigned | 403 | `FORBIDDEN` |
| Missing, malformed or impossible date; `from > to`; span > 31 days; unknown parameter | 400 | `INVALID_ARGUMENT` |

### 2.2 Permission matrix additions (F-11)

| Endpoint | Anonymous | CUSTOMER | OPERATOR (unassigned) | OPERATOR (assigned) |
|---|---|---|---|---|
| `GET /api/operator/queues/{id}/analytics` | 401 | 403 | 403 | 200 |

## 3. F-12 Advance appointment booking

Contract only. It will be implemented after 29 November.

### 3.1 Objects

**`AppointmentSlot`**:

```json
{ "id": "uuid", "serviceQueueId": "uuid", "startsAt": "2026-12-05T03:00:00.000Z", "endsAt": "2026-12-05T03:30:00.000Z", "capacity": 4, "status": "OPEN", "bookedCount": 1, "remainingCapacity": 3 }
```

`bookedCount` is shown in operator views only. Customer views show `remainingCapacity` only.

**`Appointment`**:

```json
{ "id": "uuid", "slotId": "uuid", "serviceQueueId": "uuid", "queueName": "General Inquiry Desk", "startsAt": "…", "endsAt": "…", "status": "BOOKED", "effectiveStatus": "BOOKED", "bookedAt": "…", "cancelledAt": null, "checkedInAt": null, "queueEntryId": null, "checkInOpensAt": "…", "checkInClosesAt": "…" }
```

`effectiveStatus` is one of `BOOKED`, `CANCELLED`, `CHECKED_IN` or `MISSED` (`MISSED` means `BOOKED` and `now > startsAt + 15 min`).

### 3.2 Endpoints

| # | Method and path | Role / CSRF | Body or query | Success | Errors (in check order) |
|---|---|---|---|---|---|
| 3.2.1 | `POST /api/operator/queues/{queueId}/slots` | assigned OPERATOR / yes | `{ "startsAt": ISO, "durationMinutes": 15–120, "capacity": 1–20 }` (strict) | `201 { slot }` | `400` (UUID/body, `startsAt` < now + 60 min), `401`, `403` role, `404` queue, `403` assignment, `409 DUPLICATE_SLOT` |
| 3.2.2 | `GET /api/operator/queues/{queueId}/slots?date=` | assigned OPERATOR / no | `date` required | `200 { slots[] }`, all statuses, by `startsAt` | `400`, `401`, `403`, `404` |
| 3.2.3 | `PATCH /api/operator/slots/{slotId}` | assigned OPERATOR of the slot's queue / yes | `{ "status": "CLOSED" }` | `200 { slot }` (idempotent) | `400`, `401`, `403`, `404 RESOURCE_NOT_FOUND`, `409 INVALID_STATE_TRANSITION` (when `status` is `OPEN`: no reopen) |
| 3.2.4 | `GET /api/operator/queues/{queueId}/appointments?date=` | assigned OPERATOR / no | `date` required | `200 { appointments[] }`, with `customerId` | `400`, `401`, `403`, `404` |
| 3.2.5 | `GET /api/queues/{queueId}/slots?date=` | CUSTOMER / no | `date` required | `200 { slots[] }`: `OPEN`, inside the window, not full | `400`, `401`, `403`, `404`, `409 QUEUE_NOT_AVAILABLE` |
| 3.2.6 | `POST /api/slots/{slotId}/appointments` | CUSTOMER / yes | empty body | `201 { appointment }` | `400`, `401`, `403`, `404`, `409 QUEUE_NOT_AVAILABLE`, `SLOT_CLOSED`, `BOOKING_WINDOW_CLOSED`, `DUPLICATE_BOOKING`, `SLOT_FULL` |
| 3.2.7 | `GET /api/me/appointments` | CUSTOMER / no | — | `200 { appointments[] }`, newest `startsAt` first | `401`, `403` |
| 3.2.8 | `POST /api/me/appointments/{id}/cancel` | owner CUSTOMER / yes | empty | `200 { appointment }` | `400`, `401`, `403`, `404` (also another owner), `409 INVALID_STATE_TRANSITION`, `BOOKING_WINDOW_CLOSED` |
| 3.2.9 | `POST /api/me/appointments/{id}/check-in` | owner CUSTOMER / yes | empty | `201 { appointment, entry }`, where `entry` is a `QueueEntry` with `priority: "PRIORITY"` | `400`, `401`, `403`, `404`, `409 INVALID_STATE_TRANSITION`, `CHECK_IN_WINDOW_CLOSED`, `QUEUE_NOT_AVAILABLE`, `DUPLICATE_ACTIVE_ENTRY`, `MAX_ACTIVE_ENTRIES_REACHED` |

### 3.3 Integrity rules

- Lock order: `User → ServiceQueue → AppointmentSlot → Appointment → QueueEntry`. Book locks `User` and then the slot. Check-in locks `User`, then the queue, then the appointment.
- Capacity is counted over `BOOKED` and `CHECKED_IN` under the slot lock. The partial unique index on `(slotId, customerId)` covers active rows.
- Every rejected request leaves zero changed rows.

## 4. F-13 Product hardening

### 4.1 Changes to `POST /api/auth/login` (extends Sprint 1 §6.1)

| Case | Status | Body / headers |
|---|---|---|
| Valid credentials and key not throttled | 200 | unchanged |
| Invalid credentials and key not throttled | 401 `UNAUTHORIZED` | unchanged. The failure counter for `email:` and `ip:` increments. |
| Email key has 5 failures, or IP key has 20 failures, in the current 15-minute window | 429 `RATE_LIMITED` | `Retry-After: <seconds until window end>`, with the message "Too many sign-in attempts. Try again later." The password is not checked and no session is created. |

Unknown emails follow exactly the same sequence. A successful login deletes the `email:` key.

### 4.2 Response headers (every route)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-Frame-Options` | `DENY` |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` (production only) |
| `X-Powered-By` | absent |

## 5. Revision history

| Version | Date | Section | Previous text | Change |
|---|---|---|---|---|
| 1.0 | 2026-11-28 | All | — | First version. |
