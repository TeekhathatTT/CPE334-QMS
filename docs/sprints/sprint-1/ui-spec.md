# Sprint 1 UI Specification

## 1. User experience goals

The UI must support the core queue flow for customers and operators without exposing internal implementation details. It must provide reliable status communication, role-based access enforcement, and consistent feedback across four key areas: login, queue discovery, customer detail tracking, and operator lifecycle management.

## 2. Screen map

| Screen | Role | Summary |
|---|---|---|
| `/login` | anonymous | login form for CUSTOMER and OPERATOR |
| `/customer` | CUSTOMER | OPEN queue listing and own queue entries |
| `/customer/entries/:id` | CUSTOMER | private detail for a specific own entry |
| `/operator` | OPERATOR | assigned queue overview |
| `/operator/queues/:id` | OPERATOR | queue management view for call, start, and complete actions |

## 3. Interaction rules

- The application displays only OPEN queues to customers.
- Customers may join multiple queues, but only one active entry is allowed per customer per queue.
- The UI uses API data as the source of truth and never infers queue state locally.
- A `WAITING` entry remains visible to the customer until the queue lifecycle completes.
- Operator actions are hidden or disabled when the entry is not in the required state.
- Errors are shown as user-safe messages without internal stack traces or DB details.

## 4. Status behavior

| Status | Display label |
|---|---|
| `WAITING` | Waiting |
| `CALLED` | Called |
| `SERVING` | In service |
| `COMPLETED` | Completed |

The UI must use text and icons rather than relying on color alone.

## 5. Accessibility and responsiveness

- no page-level horizontal scrolling at 360 px and 1280 px widths
- visible labels and keyboard focus
- inline validation for required fields
- touch-friendly controls on smaller screens
- status messages accessible to assistive technologies

## 6. Role-specific flows

### Customer flow
1. log in as CUSTOMER
2. view the OPEN queue catalog
3. join an OPEN queue
4. receive the assigned queue number and waiting status
5. view only the customer's own entry record

### Operator flow
1. log in as OPERATOR
2. view the assigned queue list
3. inspect queue entries in FIFO order
4. call the next eligible waiting entry
5. start and complete service in the required lifecycle order

## 7. Error and empty states

| Case | Expected behavior |
|---|---|
| unauthenticated user | redirect to login or show access message |
| cross-owner customer access | generic `404 RESOURCE_NOT_FOUND` style response |
| operator must be assigned | `403 FORBIDDEN` |
| empty queue on call next | show neutral empty state and keep queue unchanged |
| invalid transition | show conflict message and refetch state |

This UI contract is aligned with the SRS, system SDS, and API contract for Sprint 1.