# Sprint 1 API Specification

## 1. Base conventions

- Base path: `/api`
- All JSON request bodies use UTF-8
- All timestamps in HTTP responses are RFC 3339 UTC values (for example `2026-11-09T09:00:00Z`)
- Authentication uses an HTTP-only session cookie; the exact cookie name is implementation-defined and is not exposed to the browser document object model
- State-changing requests require a valid session cookie and a valid `X-CSRF-Token` header when the request is authenticated
- Successful JSON responses use the `data` envelope: `{"data": {...}}`
- `204 No Content` responses have no body and do not include a `data` envelope
- Error responses use the standard envelope: `{"error":{"code":"INVALID_ARGUMENT","message":"Request is invalid.","requestId":"..."}}`
- Customer-facing APIs never expose another customer’s private entry details or queue history
- The Sprint 1 API does not define pagination; list endpoints return a simple array in `data`

## 2. Standard error contract

| HTTP status | Error code | Meaning |
|---|---|---|
| 400 | `INVALID_ARGUMENT` | Malformed UUID, invalid request payload, validation failure, or malformed query input |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired session; invalid login credentials |
| 403 | `FORBIDDEN` | Authenticated user lacks role permission or queue assignment |
| 404 | `RESOURCE_NOT_FOUND` | Resource does not exist; also used for cross-owner customer privacy enforcement |
| 409 | `QUEUE_NOT_AVAILABLE` | Queue is closed or otherwise not eligible for join |
| 409 | `DUPLICATE_ACTIVE_ENTRY` | Customer already has an active entry in the same queue |
| 409 | `INVALID_STATE_TRANSITION` | Requested lifecycle transition is illegal |
| 409 | `CONCURRENT_MODIFICATION` | Stale or conflicting mutation was attempted |
| 500 | `INTERNAL_ERROR` | Unexpected server failure |

Important privacy rule: a customer lookup of another customer’s queue entry must return `404 RESOURCE_NOT_FOUND` rather than revealing whether that entry exists. A `404` is never used to mask an unauthenticated request; unauthenticated requests are `401 UNAUTHORIZED`.

## 3. Standard response objects

### 3.1 `User`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "customer@example.com",
  "role": "CUSTOMER"
}
```

### 3.2 `QueueSummary`

```json
{
  "id": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
  "name": "General Service",
  "description": "Walk-in service desk",
  "availability": "OPEN"
}
```

### 3.3 `QueueEntry`

```json
{
  "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
  "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "queueNumber": 12,
  "status": "WAITING",
  "joinedAt": "2026-11-09T09:00:00Z",
  "calledAt": null,
  "serviceStartedAt": null,
  "completedAt": null
}
```

Rules:
- `queueNumber` is a positive integer greater than `0`
- `status` is one of `WAITING`, `CALLED`, `SERVING`, `COMPLETED`
- `customerId` is included only in authorized responses; a customer only sees their own entry data, and an operator sees queue entries for assigned queues
- Timestamp fields that are not yet set are `null`

### 3.4 `ErrorResponse`

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "The request payload is invalid.",
    "requestId": "3d00f7f6-6cb5-4ab3-9d32-9d3d96f3b0c6"
  }
}
```

## 4. Headers and authentication

### 4.1 Required headers

- `Accept: application/json` is recommended for all API requests
- `Content-Type: application/json` is required for requests that include a JSON payload
- `X-CSRF-Token` is required for authenticated state-changing requests (for example join queue, call next, start service, complete service, logout)

### 4.2 Session and credential handling

- Authentication uses HTTP-only session cookies established after a successful `POST /api/auth/login`
- The client must return the session cookie on all protected requests
- The API must reject requests without a valid session with `401 UNAUTHORIZED`
- Requests that provide an invalid or expired session cookie must return `401 UNAUTHORIZED`
- The API must reject requests with a valid session but a missing or invalid `X-CSRF-Token` with `403 FORBIDDEN`

### 4.3 CSRF behavior

- `POST /api/auth/login` is an anonymous request and does not require a CSRF token
- `POST /api/auth/logout` requires the session cookie and valid `X-CSRF-Token`
- All other authenticated mutation endpoints use the same session + CSRF requirement
- If the CSRF token is missing or invalid, the API must reject the request before executing the mutation

## 5. URL parameter validation

All path parameter identifiers must be valid UUID v4 values.

| Parameter | Type | Validation | Malformed input response |
|---|---|---|---|
| `queueId` | UUIDv4 | Must be a valid UUID version 4 | `400 INVALID_ARGUMENT` |
| `entryId` | UUIDv4 | Must be a valid UUID version 4 | `400 INVALID_ARGUMENT` |

A malformed identifier is treated as an invalid request, not as a missing resource. Example: a non-UUID or wrong UUID version returns `400 INVALID_ARGUMENT` without a resource-lookup fallback.

## 6. Authentication endpoints

### 6.1 `POST /api/auth/login`

HTTP method and endpoint: `POST /api/auth/login`

Request Headers:
- `Content-Type: application/json`

Request Body:

```json
{
  "email": "customer@example.com",
  "password": "example-password"
}
```

Validation rules:
- `email` is required and must be a valid login identifier string
- `password` is required and must be a non-empty string
- Invalid credentials return `401 UNAUTHORIZED`
- Missing required fields or malformed payload data return `400 INVALID_ARGUMENT`

Success response:
- HTTP `200 OK`
- Response body:

```json
{
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "customer@example.com",
      "role": "CUSTOMER"
    }
  }
}
```

Example error responses:
- `400 INVALID_ARGUMENT` for malformed or missing fields
- `401 UNAUTHORIZED` for invalid credentials

### 6.2 `POST /api/auth/logout`

HTTP method and endpoint: `POST /api/auth/logout`

Request Headers:
- `Content-Type: application/json`
- `X-CSRF-Token: <token-from-session>`

Request Body: None

Validation rules:
- Valid session cookie is required
- Valid CSRF token is required
- Missing or invalid session returns `401 UNAUTHORIZED`
- Missing or invalid CSRF token returns `403 FORBIDDEN`

Success response:
- HTTP `204 No Content`
- No response body

### 6.3 `GET /api/auth/me`

HTTP method and endpoint: `GET /api/auth/me`

Request Headers:
- `Cookie: <session-cookie>`

Request Body: None

Validation rules:
- Valid session cookie required
- Expired or invalid session returns `401 UNAUTHORIZED`

Success response:
- HTTP `200 OK`

```json
{
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "customer@example.com",
      "role": "CUSTOMER"
    }
  }
}
```

## 7. Customer endpoints

### 7.1 `GET /api/queues`

HTTP method and endpoint: `GET /api/queues`

Request Headers:
- `Cookie: <session-cookie>`

Request Body: None

Validation rules:
- Must be authenticated as either `CUSTOMER` or `OPERATOR`
- Anonymous users receive `401 UNAUTHORIZED`
- Response must include only queues whose `availability` is `OPEN`

Success response:
- HTTP `200 OK`

```json
{
  "data": {
    "queues": [
      {
        "id": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
        "name": "General Service",
        "description": "Walk-in service desk",
        "availability": "OPEN"
      }
    ]
  }
}
```

Error responses:
- `401 UNAUTHORIZED` for missing or invalid session

### 7.2 `POST /api/queues/{queueId}/entries`

HTTP method and endpoint: `POST /api/queues/{queueId}/entries`

Request Headers:
- `Content-Type: application/json` (if a body is sent; the endpoint itself does not require a payload)
- `Cookie: <session-cookie>`
- `X-CSRF-Token: <token-from-session>`

Request Body: None

Validation rules:
- `queueId` must be a valid UUIDv4
- Authenticated user must be `CUSTOMER`
- `queueId` must refer to an existing queue
- Queue must be `OPEN`
- Customer must not already have an active entry in the same queue
- Queue-number allocation and entry creation must happen in a single transaction

Success response:
- HTTP `201 Created`

```json
{
  "data": {
    "entry": {
      "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
      "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
      "customerId": "550e8400-e29b-41d4-a716-446655440000",
      "queueNumber": 12,
      "status": "WAITING",
      "joinedAt": "2026-11-09T09:00:00Z",
      "calledAt": null,
      "serviceStartedAt": null,
      "completedAt": null
    }
  }
}
```

Error responses:
- `400 INVALID_ARGUMENT` for malformed `queueId`
- `401 UNAUTHORIZED` for missing or invalid session
- `403 FORBIDDEN` if the user is not a `CUSTOMER`
- `404 RESOURCE_NOT_FOUND` if the queue does not exist
- `409 QUEUE_NOT_AVAILABLE` if the queue is `CLOSED`
- `409 DUPLICATE_ACTIVE_ENTRY` if the customer already has an active entry in that queue

### 7.3 `GET /api/me/queue-entries`

HTTP method and endpoint: `GET /api/me/queue-entries`

Request Headers:
- `Cookie: <session-cookie>`

Request Body: None

Validation rules:
- Must be authenticated as `CUSTOMER`
- Returns only entries belonging to the current customer
- Completed entries remain visible for history

Success response:
- HTTP `200 OK`

```json
{
  "data": {
    "entries": [
      {
        "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
        "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
        "customerId": "550e8400-e29b-41d4-a716-446655440000",
        "queueNumber": 12,
        "status": "WAITING",
        "joinedAt": "2026-11-09T09:00:00Z",
        "calledAt": null,
        "serviceStartedAt": null,
        "completedAt": null
      }
    ]
  }
}
```

Error responses:
- `401 UNAUTHORIZED` for missing or invalid session
- `403 FORBIDDEN` for non-customer roles

### 7.4 `GET /api/me/queue-entries/{entryId}`

HTTP method and endpoint: `GET /api/me/queue-entries/{entryId}`

Request Headers:
- `Cookie: <session-cookie>`

Request Body: None

Validation rules:
- `entryId` must be a valid UUIDv4
- Authenticated user must be `CUSTOMER`
- Returns only the customer’s own entry
- Cross-owner access is masked as `404 RESOURCE_NOT_FOUND`

Success response:
- HTTP `200 OK`

```json
{
  "data": {
    "entry": {
      "id": "f4d56583-5d7d-4fef-bb21-5e6a5a7a9a68",
      "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
      "customerId": "550e8400-e29b-41d4-a716-446655440000",
      "queueNumber": 12,
      "status": "CALLED",
      "joinedAt": "2026-11-09T09:00:00Z",
      "calledAt": "2026-11-09T09:02:00Z",
      "serviceStartedAt": null,
      "completedAt": null
    }
  }
}
```

Error responses:
- `400 INVALID_ARGUMENT` for malformed `entryId`
- `401 UNAUTHORIZED` for missing or invalid session
- `403 FORBIDDEN` for wrong role
- `404 RESOURCE_NOT_FOUND` for missing or cross-owner entry

## 8. Operator endpoints

### 8.1 `GET /api/operator/queues`

HTTP method and endpoint: `GET /api/operator/queues`

Request Headers:
- `Cookie: <session-cookie>`

Request Body: None

Validation rules:
- Must be authenticated as `OPERATOR`
- Returns only queues assigned to the authenticated operator

Success response:
- HTTP `200 OK`

```json
{
  "data": {
    "queues": [
      {
        "id": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
        "name": "General Service",
        "description": "Walk-in service desk",
        "availability": "OPEN"
      }
    ]
  }
}
```

Error responses:
- `401 UNAUTHORIZED` for missing or invalid session
- `403 FORBIDDEN` if the user is not an `OPERATOR`

### 8.2 `GET /api/operator/queues/{queueId}/entries`

HTTP method and endpoint: `GET /api/operator/queues/{queueId}/entries`

Request Headers:
- `Cookie: <session-cookie>`

Request Body: None

Validation rules:
- `queueId` must be a valid UUIDv4
- User must be an `OPERATOR`
- Operator must be assigned to the target queue
- Entries are returned in deterministic FIFO order: `joinedAt ASC, id ASC`

Success response:
- HTTP `200 OK`

```json
{
  "data": {
    "entries": [
      {
        "id": "b440510d-90e0-4678-8658-40333b7aa3de",
        "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
        "customerId": "7a7efc69-19a0-47c7-9d60-b943af3f7f24",
        "queueNumber": 5,
        "status": "WAITING",
        "joinedAt": "2026-11-09T08:58:00Z",
        "calledAt": null,
        "serviceStartedAt": null,
        "completedAt": null
      }
    ]
  }
}
```

Error responses:
- `400 INVALID_ARGUMENT` for malformed `queueId`
- `401 UNAUTHORIZED` for missing or invalid session
- `403 FORBIDDEN` when the operator is unassigned to that queue
- `404 RESOURCE_NOT_FOUND` if the queue does not exist

### 8.3 `POST /api/operator/queues/{queueId}/call-next`

HTTP method and endpoint: `POST /api/operator/queues/{queueId}/call-next`

Request Headers:
- `Cookie: <session-cookie>`
- `X-CSRF-Token: <token-from-session>`

Request Body: None

Validation rules:
- `queueId` must be a valid UUIDv4
- User must be an assigned `OPERATOR`
- Only `WAITING` entries are eligible
- The oldest eligible entry is selected by `joinedAt ASC, id ASC`
- If no eligible entry exists, the API returns `204 No Content` without mutating state

Success response (when an entry is eligible):
- HTTP `200 OK`

```json
{
  "data": {
    "entry": {
      "id": "b440510d-90e0-4678-8658-40333b7aa3de",
      "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
      "customerId": "7a7efc69-19a0-47c7-9d60-b943af3f7f24",
      "queueNumber": 5,
      "status": "CALLED",
      "joinedAt": "2026-11-09T08:58:00Z",
      "calledAt": "2026-11-09T09:04:00Z",
      "serviceStartedAt": null,
      "completedAt": null
    }
  }
}
```

Success response (when queue is empty):
- HTTP `204 No Content`
- No response body

Error responses:
- `400 INVALID_ARGUMENT` for malformed `queueId`
- `401 UNAUTHORIZED` for missing or invalid session
- `403 FORBIDDEN` when the operator is not assigned to the queue
- `404 RESOURCE_NOT_FOUND` if the queue does not exist
- `409 INVALID_STATE_TRANSITION` when the queue or target entry is in an invalid lifecycle state
- `409 CONCURRENT_MODIFICATION` when a stale or conflicting mutation is attempted

### 8.4 `POST /api/operator/queue-entries/{entryId}/start`

HTTP method and endpoint: `POST /api/operator/queue-entries/{entryId}/start`

Request Headers:
- `Cookie: <session-cookie>`
- `X-CSRF-Token: <token-from-session>`

Request Body: None

Validation rules:
- `entryId` must be a valid UUIDv4
- Operator must be assigned to the entry’s queue
- Only a `CALLED` entry may transition to `SERVING`

Success response:
- HTTP `200 OK`

```json
{
  "data": {
    "entry": {
      "id": "b440510d-90e0-4678-8658-40333b7aa3de",
      "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
      "customerId": "7a7efc69-19a0-47c7-9d60-b943af3f7f24",
      "queueNumber": 5,
      "status": "SERVING",
      "joinedAt": "2026-11-09T08:58:00Z",
      "calledAt": "2026-11-09T09:04:00Z",
      "serviceStartedAt": "2026-11-09T09:05:00Z",
      "completedAt": null
    }
  }
}
```

Error responses:
- `400 INVALID_ARGUMENT` for malformed `entryId`
- `401 UNAUTHORIZED` for missing or invalid session
- `403 FORBIDDEN` if the operator is not assigned to the queue
- `404 RESOURCE_NOT_FOUND` if the entry or queue is missing
- `409 INVALID_STATE_TRANSITION` if the entry is not in the correct lifecycle stage

### 8.5 `POST /api/operator/queue-entries/{entryId}/complete`

HTTP method and endpoint: `POST /api/operator/queue-entries/{entryId}/complete`

Request Headers:
- `Cookie: <session-cookie>`
- `X-CSRF-Token: <token-from-session>`

Request Body: None

Validation rules:
- `entryId` must be a valid UUIDv4
- Operator must be assigned to the entry’s queue
- Only a `SERVING` entry may transition to `COMPLETED`

Success response:
- HTTP `200 OK`

```json
{
  "data": {
    "entry": {
      "id": "b440510d-90e0-4678-8658-40333b7aa3de",
      "serviceQueueId": "0bfe6fd8-7f32-44b1-987e-23ef3f2a7d17",
      "customerId": "7a7efc69-19a0-47c7-9d60-b943af3f7f24",
      "queueNumber": 5,
      "status": "COMPLETED",
      "joinedAt": "2026-11-09T08:58:00Z",
      "calledAt": "2026-11-09T09:04:00Z",
      "serviceStartedAt": "2026-11-09T09:05:00Z",
      "completedAt": "2026-11-09T09:08:00Z"
    }
  }
}
```

Error responses:
- `400 INVALID_ARGUMENT` for malformed `entryId`
- `401 UNAUTHORIZED` for missing or invalid session
- `403 FORBIDDEN` if the operator is not assigned to the queue
- `404 RESOURCE_NOT_FOUND` if the entry or queue is missing
- `409 INVALID_STATE_TRANSITION` if the entry is not in the correct lifecycle stage

## 9. Lifecycle and integrity rules

- Allowed lifecycle states are `WAITING -> CALLED -> SERVING -> COMPLETED`
- Only `WAITING` entries are eligible for `call-next`
- Queue numbers are positive integers unique within a single `serviceQueueId`
- Queue numbers are never reset during Sprint 1
- A customer may hold at most one active entry per queue; completed entries may be rejoined later
- Queue ordering uses `joinedAt ASC, id ASC`
- Number allocation and entry creation are committed in the same transaction
- State timestamp mutation and status update are committed atomically

## 10. Traceability

This API specification aligns with the SRS, system SDS, and Sprint 1 feature inventory for FR-01 through FR-13 and business rules BR-01 through BR-12.
