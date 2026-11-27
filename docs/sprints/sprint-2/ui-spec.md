# Sprint 2 UI Specification

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-27 | F-07 contract v1: "Leave queue" control on the customer entry detail page, `Cancelled` status |

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
