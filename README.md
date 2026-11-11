# Queue and Service Management System (QMS)

QMS is a planned queue-management application for a service counter or restaurant. It supports customer queue registration, personal status tracking, and operator-managed service workflows in FIFO order.

## Documentation set

- [docs/srs.md](docs/srs.md) — software requirements specification and stakeholder problem narrative
- [docs/features.md](docs/features.md) — Sprint 1 and follow-on feature inventory
- [docs/traceability.md](docs/traceability.md) — requirement-to-feature-to-test traceability
- [docs/system-sds.md](docs/system-sds.md) — system-level design, data model, and integrity rules
- [docs/sprints/plan.md](docs/sprints/plan.md) — three-sprint delivery plan
- [docs/sprints/sprint-1/api-spec.md](docs/sprints/sprint-1/api-spec.md) — API contract for Sprint 1
- [docs/sprints/sprint-1/ui-spec.md](docs/sprints/sprint-1/ui-spec.md) — user interface workflow specification
- [docs/sprints/sprint-1/tests.md](docs/sprints/sprint-1/tests.md) — test contract and acceptance coverage

## Sprint 1 scope

Sprint 1 delivers the minimum usable queue-management workflow: customer and operator authentication, queue availability and number allocation, customer join status tracking, and operator call/start/complete flows. It intentionally excludes account self-registration, password reset, cancellation, no-show handling, multiple counters, priority management, analytics, and appointment booking.

## Status

This branch is documentation-only and represents the Sprint 1 engineering contract. No working application source, database schema, API handlers, UI implementation, or deployment configuration is included.