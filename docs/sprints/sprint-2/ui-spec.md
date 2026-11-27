# Sprint 2 UI Specification

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-27 | F-07 contract v1: "Leave queue" control on the customer entry detail page, `Cancelled` status |
| 1.1 | 2026-11-27 | Implementation note for §3.2 "Idle": the Leave queue button sits on its own row **below** the footer row (status text and Refresh), not in the same row as Refresh, so that the confirmation panel can open in place at full width. Behavior, text, order of focus and all acceptance criteria are unchanged. |
| 2.0 | 2026-11-27 | F-08 contract v1 (issue #41): §6–§9 add the operator Mark no-show and Return to queue controls, the No-show section, the `No-show` status and the customer messages. §1–§5 (F-07) unchanged. |
| 2.1 | 2026-11-27 | Implementation note for §8.1: in the Active Service card, Mark no-show is the third button, after Start Service and Complete Service, not directly next to Start Service. Labels, visibility, busy state, keyboard order and all acceptance criteria are unchanged. |
| 3.0 | 2026-11-27 | F-09 contract v1 (issue #42): §10–§13 add the operator Counters panel (open/close toggle, counter-scoped Call Next, active entry counter badges) and customer assigned-counter messaging/badges. §1–§9 (F-07, F-08) unchanged. |
| 3.1 | 2026-11-27 | F-09 contract v1.1 (PR review fixes): disables controls with `"Assigned to another operator"` for non-owned counters, shows legacy Call Next fallback whenever the operator has zero usable counters, and standardizes counter badges strictly to `CALLED` and `SERVING` entries only (removing `"may appear"` ambiguity). |

This document extends the [Sprint 1 UI specification](../sprint-1/ui-spec.md). All Sprint 1 rules (accessibility, responsiveness, error states, session expiry) still apply. Requirements: [SRS](../../srs.md) FR-14, BR-13, BR-14, AC-24. API: [api-spec.md](./api-spec.md) §3.1. Design: [F-07 feature SDS](../../features/sprint-2-f07-customer-cancellation.md).

## 1. Screens affected

| Screen | Component | Change |
|---|---|---|
| `/customer/entries/:id` | `client/src/pages/EntryDetailPage.tsx` | New **Leave queue** control, confirmation, busy, success and error states; `CANCELLED` display; polling stops on `CANCELLED` |
| `/customer` → My Active Tickets | `client/src/components/customer/MyTicketsList.tsx` | No new control. Cancelled entries appear with the `Cancelled` badge, like completed ones (System SDS §11 D-6) |
| Status badge | `client/src/components/customer/StatusBadge.tsx` | New label and icon for `CANCELLED` |
| Timestamps | `client/src/components/customer/EntryTimestamps.tsx` | New row "Cancelled:" when `cancelledAt` is set |
| `/operator/queues/:id` | `client/src/pages/OperatorQueueDetailPage.tsx` | No change. The API no longer returns `CANCELLED` entries to operators |

## 2. Status label (extends Sprint 1 §6)

| QueueEntry status | UI label | Icon | Meaning |
|---|---|---|---|
| `CANCELLED` | Cancelled | crossed circle | The customer left the queue; the entry is terminal |

Detail-page message for `CANCELLED`: "You left this queue."

## 3. Leave queue control

### 3.1 Visibility

| Entry status | Leave queue button |
|---|---|
| `WAITING` | shown |
| `CALLED`, `SERVING`, `COMPLETED`, `CANCELLED` | **not rendered** (not just disabled) |

Hiding the button is not the authorization boundary; the server rejects a cancel in any non-`WAITING` state (BR-13).

### 3.2 States

| State | What the customer sees |
|---|---|
| Idle | Secondary button **Leave queue** below the timestamps, in the same row as **Refresh** (wraps on narrow screens) |
| Confirming | Inline panel (`role="group"`, labelled "Confirm leaving the queue"): text "Leave {queue name}? Queue number {N} will not be called, and if you join again you will get a new number." Buttons **Yes, leave queue** (destructive style) and **Keep my place**. Focus moves to **Keep my place**. `Escape` or **Keep my place** closes the panel and returns focus to **Leave queue**. No request has been sent yet. |
| Busy | **Yes, leave queue** shows a spinner and the text "Leaving queue..."; both buttons are disabled (`aria-disabled`/`disabled`). A per-entry in-flight guard means two fast activations send exactly one request. |
| Success | The panel closes. The status badge shows **Cancelled**, the message is "You left this queue.", the timestamps include "Cancelled: {time}", and the footer reads "You left this queue. This entry no longer updates." The live region announces "You left the queue. Queue number {N} is now Cancelled." Polling stops. The **Leave queue** button is no longer rendered. Focus moves to the page heading so it is not lost. |
| Error | The panel stays open with the buttons enabled again (except after `404`), and a message is shown inside it with `role="alert"` (see §3.3). |

### 3.3 Error messages

| API response | Message | Follow-up |
|---|---|---|
| `409 INVALID_STATE_TRANSITION` or `409 CONCURRENT_MODIFICATION` | "You can no longer leave this queue because your status has changed." | Re-read the entry. If it is no longer `WAITING`, the control disappears and the new status is shown; the message stays visible above the article until the next action |
| `404 RESOURCE_NOT_FOUND`, `400 INVALID_ARGUMENT` | "We couldn't find that queue entry." | Re-read; the page shows the existing not-found state |
| `403 FORBIDDEN` (includes CSRF failure) | "We couldn't verify this request. Please refresh the page or sign in again." | No logout |
| `401 UNAUTHORIZED` | Existing global "Session expired. Please sign in again." banner | Global handler (Sprint 1 §7) |
| Network error or any other status | "Something went wrong. Please try again." | Buttons re-enabled |

Server error messages are never shown.

## 4. Accessibility and responsiveness

- Every control is a native `<button>`; Tab/Shift+Tab reach them in visual order; Enter and Space activate them.
- The confirmation panel is inline, not a modal, so there is no focus trap; `Escape` closes it.
- Status is shown with text and icon, never colour alone.
- The busy state is announced through the button text ("Leaving queue...").
- At 360 px and 1280 px the detail page, with the confirmation panel open, has no page-level horizontal overflow; buttons stack vertically below 640 px.

## 5. Acceptance mapping

| UI behavior | AC | Planned tests |
|---|---|---|
| Button only for `WAITING` | AC-24, AC-18 | CANCEL-016, CANCEL-018 |
| Confirmation before request; busy; success; errors | AC-24 | CANCEL-016, CANCEL-017 |
| Cancelled state persists after reload | AC-17, AC-24 | CANCEL-017 |
| Rejoin after cancel from the UI | AC-21 | CANCEL-017 |
| Keyboard only; 360 px / 1280 px | AC-24 | CANCEL-019 |

---

# F-08 No-show handling and recovery (v2.0)

Requirements: [SRS](../../srs.md) v3.0 FR-15, FR-16, BR-15–BR-17, AC-33, AC-34. API: [api-spec.md](./api-spec.md) §9. Design: [F-08 feature SDS](../../features/sprint-2-f08-no-show-recovery.md).

## 6. Screens affected (F-08)

| Screen | Component | Change |
|---|---|---|
| `/operator/queues/:id` | `client/src/pages/OperatorQueueDetailPage.tsx` | **Mark no-show** button on `CALLED` entries; new **No-show** section with **Return to queue**; summary adds "No-show: N" |
| `/customer/entries/:id` | `client/src/pages/EntryDetailPage.tsx` | `NO_SHOW` message; polling stops when the no-show is final |
| `/customer` → My Active Tickets | `client/src/components/customer/MyTicketsList.tsx` | No new control. `NO_SHOW` entries show the `No-show` badge |
| Status badge | `client/src/components/customer/StatusBadge.tsx` | New label and icon for `NO_SHOW` |
| Timestamps | `client/src/components/customer/EntryTimestamps.tsx` | New rows "Missed:" (`noShowAt`) and "Returned to queue:" (`recoveredAt`) |

## 7. Status label (extends §2)

| QueueEntry status | UI label | Icon | Meaning |
|---|---|---|---|
| `NO_SHOW` | No-show | clock with a slash | The customer was called but did not come |

Customer detail-page messages for `NO_SHOW`:
- `noShowCount` 1 (can still be returned): "You missed your turn. If you are still here, please go to the counter. Staff can return you to the queue once."
- `noShowCount` 2 (final): "You missed your turn again, so this entry is closed. You can join the queue again." The footer reads "This entry no longer updates." and polling stops.

A returned entry is `WAITING` and is shown like any waiting entry, with the extra "Returned to queue:" time and the F-07 Leave queue button.

## 8. Operator controls

### 8.1 Visibility

| Entry status | Mark no-show | Return to queue |
|---|---|---|
| `CALLED` | shown (Active Service section, next to Start Service) | — |
| `NO_SHOW`, `noShowCount` 1 | — | shown (No-show section) |
| `NO_SHOW`, `noShowCount` 2 | — | **not rendered**; the text "Already returned once. This entry cannot be returned again." is shown instead |
| any other status | not rendered | not rendered |

Hiding a button is not the authorization boundary; the server checks role, assignment and state (BR-15, BR-16).

### 8.2 States

| State | Mark no-show | Return to queue |
|---|---|---|
| Idle | Secondary button "Mark no-show", `aria-label` "Mark queue number N as no-show" | Button "Return to queue", `aria-label` "Return queue number N to the queue" |
| Busy | Spinner + "Marking no-show..."; the entry's other buttons (Start Service) are disabled too | Spinner + "Returning to queue..." |
| Success | Status message "Marked queue number N as no-show."; the list is reloaded, so the entry moves to the No-show section | Status message "Returned queue number N to the queue."; the list is reloaded, so the entry is in the Waiting Queue at its FIFO position |
| Error | Alert with the message from §8.3; on `409` and `404` the list is reloaded | same |

An in-flight guard per entry (the existing `entryActionInFlightRef`) means a double click sends one request. There is no confirmation step (feature SDS D-12).

### 8.3 Error messages

| API response | Message |
|---|---|
| `409 RECOVERY_LIMIT_REACHED` | "This entry was already returned to the queue once and cannot be returned again." |
| `409 DUPLICATE_ACTIVE_ENTRY` | "This customer has already joined the queue again, so this entry cannot be returned." |
| other `409` | "This queue entry's status has changed. The queue has been refreshed." (existing) |
| `404` | "We couldn't find that queue entry." (existing) |
| `403` CSRF / other | existing CSRF / permission messages |
| `401` | global session-expired handler |
| network or other | "Something went wrong. Please try again." (existing) |

### 8.4 No-show section

- Heading "No-show (N)", below the Waiting Queue section and above Completed. Empty state: "No missed entries."
- Each item: queue number, `No-show` badge, Customer ID, timestamps (Joined, Called, Missed, Returned to queue if set), then the control from §8.1.
- Items are in the order the API returns them (`joinedAt ASC, id ASC`).
- The summary line reads "Waiting: W · Active: A · No-show: N · Completed: C".

## 9. Accessibility, responsiveness and acceptance mapping

- All controls are native `<button>` elements reachable with Tab in visual order; Enter and Space activate them.
- Status is shown with text and icon, never colour alone. Busy states are announced through the button text; results through the existing live region.
- At 360 px and 1280 px the operator page with entries in every section has no page-level horizontal overflow; buttons stack below 640 px.

| UI behavior | AC | Planned tests |
|---|---|---|
| Mark no-show only on `CALLED`; Return only while `noShowCount` 1 | AC-33 | NOSHOW-015, NOSHOW-017 |
| Busy, success, error messages, list refresh on `409` | AC-33 | NOSHOW-015 |
| Returned entry back in the waiting list, called next | AC-33, AC-28 | NOSHOW-017 |
| Customer page messages, badge, timestamps, polling stop | AC-34 | NOSHOW-016, NOSHOW-018 |
| Keyboard only; 360 px / 1280 px | AC-33 | NOSHOW-019 |

---

# F-09 Multi-counter support (v3.0)

Requirements: [SRS](../../srs.md) v4.0 FR-17–FR-19, BR-18–BR-20, AC-42, AC-43. API: [api-spec.md](./api-spec.md) §12–§14. Design: [F-09 feature SDS](../../features/sprint-2-f09-multi-counter.md).

## 10. Screens affected (F-09)

| Screen | Component | Change |
|---|---|---|
| `/operator/queues/:id` | `client/src/pages/OperatorQueueDetailPage.tsx`, `client/src/components/operator/CounterPanel.tsx` (new) | New **Counters** section listing queue counters with `Open`/`Closed` badges, **Open counter** / **Close counter** toggle buttons, and per-counter **Call Next** buttons (both controls disabled with label `"Assigned to another operator"` when `assignedOperatorId` belongs to another user); counter badges rendered on `CALLED` and `SERVING` entries only (never on `WAITING`, `COMPLETED`, `NO_SHOW`, or `CANCELLED`); legacy top-level Call Next shown whenever the signed-in operator has zero usable counters in the queue |
| `/customer/entries/:id` | `client/src/pages/EntryDetailPage.tsx` | Display prominent assigned counter badge and counter-specific prompt for `CALLED` and `SERVING` entries only when `counterName` is non-null; keep Sprint 1 text as fallback when `counterName` is `null`; never render counter badge for `WAITING`, `COMPLETED`, `NO_SHOW`, or `CANCELLED` |
| `/customer` → My Active Tickets | `client/src/components/customer/MyTicketsList.tsx` | Render assigned counter badge next to status badge on `CALLED` and `SERVING` cards only when `counterName` is non-null (never on `WAITING`, `COMPLETED`, `NO_SHOW`, or `CANCELLED`) |

## 11. Counter status labels and customer messages

### 11.1 Counter status badges (operator UI)

| Counter status | UI label | Icon | Meaning |
|---|---|---|---|
| `OPEN` | Open | filled green dot / check circle | Counter is accepting calls via counter-scoped Call Next |
| `CLOSED` | Closed | hollow/neutral dash circle | Counter is paused; Call Next is disabled until reopened, while existing active entries can still finish |

Status is always communicated with both visible text and an icon, never color alone.

### 11.2 Customer assigned-counter messages (`/customer/entries/:id`)

| Entry status | `counterName` | Customer detail message | Counter badge shown? |
|---|---|---|---|
| `CALLED` | non-null (e.g. `"Counter 1"`) | `"Please proceed to Counter 1."` | Yes (`Counter 1`) |
| `CALLED` | `null` (legacy Call Next) | `"Please go to the service desk."` (unchanged Sprint 1) | No |
| `SERVING` | non-null (e.g. `"Counter 1"`) | `"Your service is in progress at Counter 1."` | Yes (`Counter 1`) |
| `SERVING` | `null` (legacy Call Next) | `"Your service is in progress."` (unchanged Sprint 1) | No |
| `WAITING`, `CANCELLED` | `null` | unchanged | No |
| `COMPLETED`, `NO_SHOW` | non-null or `null` | unchanged | No |

Deterministic badge rule (both customer and operator views): render the counter badge on **`CALLED` and `SERVING` entries only** when `counterName` is non-null; do **not** render a counter badge on `WAITING`, `COMPLETED`, `NO_SHOW`, or `CANCELLED` entries.

## 12. Operator counter controls

### 12.1 Counters section layout

- Heading: `"Counters (N)"` (positioned above Active Service on `/operator/queues/:id`).
- Empty state (when `counters.length === 0`): `"No counters configured for this queue."`.
- **Legacy Call Next fallback rule:** render the existing top-level queue-level **Call Next** button whenever the signed-in operator has **zero usable (accessible) counters** in the queue—that is, `counters.length === 0` OR every counter in `counters` has `assignedOperatorId !== null && assignedOperatorId !== currentUser.id`.
- Each counter card displays:
  1. Counter name (e.g., `Counter 1`) and `Open` / `Closed` status badge.
  2. Ownership notice (only when `counter.assignedOperatorId !== null && counter.assignedOperatorId !== currentUser.id`): visible label `"Assigned to another operator"`.
  3. Status toggle button: `"Close counter"` (`aria-label="Close Counter 1"`) when `OPEN`; `"Open counter"` (`aria-label="Open Counter 1"`) when `CLOSED`. Disabled while a request for that counter is in flight OR when the counter is assigned to another operator.
  4. Primary action button: `"Call Next"` (`aria-label="Call next customer to Counter 1"`), **disabled** when `counter.status === 'CLOSED'`, while a request for that counter is in flight, OR when the counter is assigned to another operator.
- **Entry counter badges:** render the counter badge (e.g., `Counter 1`) next to the status badge on **`CALLED` and `SERVING` entries only** whenever `entry.counterName` is non-null. Never render a counter badge on `WAITING`, `COMPLETED`, `NO_SHOW`, or `CANCELLED` entries.

### 12.2 States

| State | Status toggle (`PATCH .../status`) | Counter Call Next (`POST .../call-next`) |
|---|---|---|
| Idle | Secondary button `"Close counter"` or `"Open counter"` | Primary button `"Call Next"` (enabled when `OPEN`, disabled when `CLOSED`) |
| Busy | Spinner + `"Updating counter..."`; both buttons on that counter card disabled; per-counter in-flight guard prevents duplicate clicks | Spinner + `"Calling next..."`; both buttons on that counter card disabled; per-counter in-flight guard prevents duplicate clicks |
| Success | Live region announces `"Counter 1 is now Closed."` / `"Counter 1 is now Open."`; counters list updates immediately | Live region announces `"Called queue number N to Counter 1."`; both entries and counters refresh so the entry appears in Active Service with its `Counter 1` badge |
| Error | Alert (`role="alert"`) with message from §12.3; counters/entries refreshed on `409`/`404` | Alert (`role="alert"`) with message from §12.3; counters/entries refreshed on `409`/`404` |

Disabling Call Next on a `CLOSED` counter is a UX convenience, not an authorization boundary; the server authoritatively rejects calls on a `CLOSED` counter with `409 COUNTER_CLOSED` (BR-19).

### 12.3 Error messages (operator counter actions)

| API response | Message | Follow-up |
|---|---|---|
| `409 COUNTER_CLOSED` | `"This counter is closed. Open the counter before calling the next customer."` | Refresh counters and entries |
| `409 NO_WAITING_ENTRIES` | `"There are no waiting customers in this queue right now."` | Refresh entries |
| `400 INVALID_ARGUMENT` | `"Invalid counter request. Please refresh and try again."` | None |
| `404 RESOURCE_NOT_FOUND` | `"We couldn't find that counter."` | Refresh counters |
| `403 FORBIDDEN` (CSRF / RBAC) | Existing CSRF or `"You do not have permission to perform this action."` | None |
| `401 UNAUTHORIZED` | Existing global session-expired banner | Global handler |
| Network or other | `"Something went wrong. Please try again."` | None |

Server error messages are never rendered directly to users.

## 13. Accessibility, responsiveness and acceptance mapping

- Every counter toggle and Call Next control is a native `<button>` with descriptive `aria-label` reachable via Tab/Shift+Tab in visual order and activated with Enter or Space.
- Counter status (`Open`/`Closed`) uses text + icon, never color alone; live updates announce via the existing `aria-live="polite"` region; errors render in `role="alert"`.
- At `360 px` and `1280 px`, both `/operator/queues/:id` (with multiple counters and active entries) and `/customer/entries/:id` (with counter badge and message) render without page-level horizontal overflow; counter cards stack in a single column below `640 px` and arrange in a responsive grid on desktop.

| UI behavior | AC | Planned tests |
|---|---|---|
| Counters panel, Open/Close toggle, Call Next disabled when `CLOSED`, active entry counter badges, busy/error states | AC-42 | COUNTER-014, COUNTER-016, COUNTER-017 |
| Customer counter prompt (`CALLED` / `SERVING`), `null` fallback, My Active Tickets counter badge | AC-43 | COUNTER-015, COUNTER-016, COUNTER-017 |
| Keyboard-only operation; 360 px / 1280 px zero horizontal overflow | AC-42, AC-43 | COUNTER-018 |
