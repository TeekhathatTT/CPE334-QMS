# Sprint 3 UI Specification

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-28 | @TeekhathatTT (review: @Khwanklao, pending) | First Sprint 3 contract (issue #44): F-11 operator analytics page, F-12 booking screens, and F-13 login throttling message. Aligned with SRS v6.0. |
| 1.1 | 2026-11-28 | @TeekhathatTT | §2.2 item 3: below `sm` the daily breakdown is shown as cards (found by ANALYTICS-012). |

## 1. Conventions (unchanged)

These Sprint 1 and Sprint 2 rules still apply:
- Tailwind layout
- visible focus rings
- `aria-live="polite"` announcements
- user-safe error text, never raw codes
- a 44 px minimum touch target
- no page-level horizontal overflow at 360 px and 1280 px
- status is never shown by colour alone

## 2. F-11 Operator analytics page

### 2.1 Route and entry point

- Route: `/operator/queues/:id/analytics`, inside the existing `ProtectedRoute allowedRoles={['OPERATOR']}` and `OperatorLayout`.
- Entry: on `/operator/queues/:id`, a link labelled **Analytics** (`aria-label="View analytics for <queue name>"`) next to the queue heading.
- Page heading: `<queue name> — Analytics`. It has a back link, **Back to queue**.

### 2.2 Layout

1. **Range form:**
   - Fields: **From** (`<input type="date">`, label "From") and **To** (label "To").
   - Button: **Show report**.
   - Defaults: From = today − 6 days and To = today, both in Asia/Bangkok.
   - Client validation:
     - both fields are required
     - From must not be after To ("Start date must be on or before the end date.")
     - the span must be at most 31 days ("Choose a range of 31 days or fewer.")
   - Validation messages are linked with `aria-describedby`.
2. **Summary**: a definition list or cards with:
   - Joined, Completed, Cancelled and No-show counts
   - Waiting time: average, median and 90th percentile
   - Service time: average, median and 90th percentile

   Durations are shown as `Xm YYs` (for example `4m 05s`; `1h 02m 03s` when 1 hour or more), or `—` when the value is `null`. Each figure has a visible label.
3. **Daily table**: a `<table>` with the `<caption>` "Daily breakdown, <from> to <to> (Asia/Bangkok)" and the columns Date, Joined, Completed, Cancelled, No-show, Avg wait and Avg service. On narrow screens the table sits in a horizontally scrollable container (`overflow-x-auto`, focusable with `tabindex="0"` and `aria-label`), so the page itself never scrolls sideways.
   *Rev. 1.1:* below the Tailwind `sm` breakpoint (640 px), the daily breakdown is shown as a list (`<ul aria-label="Daily breakdown">`) with one card per day, holding the same seven values, and the table is hidden (`display: none`). The scroll container described above did not pass the UI-001 check: an element inside it still crossed the 360 px viewport edge (ANALYTICS-012).
4. **Footnote**: "Counts include customers who joined in the selected dates. Times use Asia/Bangkok."

### 2.3 States

| State | Display |
|---|---|
| Loading | The **Show report** button is disabled and reads "Loading report…". The summary area has `aria-busy="true"`. |
| Loaded with data | Summary and table. `aria-live` announces "Report updated for <from> to <to>." |
| Loaded, `joined = 0` | Summary with zeros and `—`, the table with zero rows per day, and the note "No customers joined this queue in the selected dates." |
| `400` | "Choose a valid date range of 31 days or fewer." |
| `403` | "You are not assigned to this queue." |
| `404` | "We couldn't find that queue." with the link "Back to your queues". |
| Network or `5xx` | "We couldn't load the report. Please try again." with a **Retry** button |
| `401` | Uses the existing session-expired handler (redirect to login). |

### 2.4 Acceptance mapping

AC-62. Tests: ANALYTICS-010 and ANALYTICS-011 (client), ANALYTICS-012 (E2E, 360 px and 1280 px).

## 3. F-12 Booking screens

Contract only. These screens will be implemented after 29 November.

| Screen | Route | Content |
|---|---|---|
| Book an appointment | `/customer/queues/:id/book` (link **Book a time** on each queue card) | A date picker (today to +14 days) and a list of bookable slots with the local time range and "N places left". A **Book** button per slot, with confirmation text "Book <time> at <queue>?". |
| My appointments | `/customer/appointments` (customer nav link) | Upcoming and past appointments, each with status text (`Booked`, `Cancelled`, `Checked in`, `Missed`) and the check-in window "Check in between HH:MM and HH:MM". Buttons: **Cancel booking** (BOOKED, before the start) and **Check in** (only inside the window). After a check-in, a link to the created queue entry. |
| Operator slots | `/operator/queues/:id/slots` (link **Slots** on the queue workspace) | A form with start date and time, duration (15–120) and capacity (1–20), plus a list of slots for a date showing the booked/capacity count and status, with a **Close slot** button. Each slot's appointments are listed with their status. |

Error messages (all screens):

| Code | Message |
|---|---|
| `SLOT_FULL` | "That time is now full. Please choose another." |
| `SLOT_CLOSED` | "That time is no longer taking bookings." |
| `BOOKING_WINDOW_CLOSED` | "Bookings for that time are closed." Cancel case: "This appointment has already started and can't be cancelled." |
| `DUPLICATE_BOOKING` | "You already have an appointment for this queue." |
| `CHECK_IN_WINDOW_CLOSED` | "Check-in is open from 15 minutes before to 15 minutes after your time." |
| `DUPLICATE_SLOT` | "A slot already starts at that time." |
| Queue and cap codes | Same wording as the existing join errors |

Acceptance mapping: AC-72.

## 4. F-13 hardening UI changes

- Login page: for `429 RATE_LIMITED`, show "Too many sign-in attempts. Try again in N minutes.", where N = ceil(`Retry-After` / 60). It appears in the existing error alert and is announced with `role="alert"`. The submit button stays enabled.
- Fixes found by the NFR-11 axe scan are made where the scan flags them. No other planned visual change.

## 5. Revision history

| Version | Date | Section | Previous text | Change |
|---|---|---|---|---|
| 1.0 | 2026-11-28 | All | — | First version. |
| 1.1 | 2026-11-28 | §2.2 | Item 3 described only the table in a horizontally scrollable container (kept). | Adds the cards below `sm`. |
