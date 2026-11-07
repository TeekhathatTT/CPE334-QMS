# Queue and Service Management System (QMS)

QMS is a planned queue management application for a service counter or restaurant. It will let customers join a service queue and check their own queue status, while authorized operators call and serve customers in FIFO order.

## Sprint 1

Sprint 1 defines and delivers the core waiting-line workflow: Customer and Operator authentication, role and queue authorization, service queue discovery, customer registration, queue number assignment, personal status tracking, and operator actions to call, start and complete service.

The current repository is at the specification stage. Application source code, database schema, package manifests and local run scripts are not present on the Sprint 1 integration branch yet. This README does not describe a working application or provide setup commands.

### Sprint 1 boundaries

Included: `WAITING -> CALLED -> SERVING -> COMPLETED`, FIFO ordering, same-queue duplicate active-entry prevention, customer ownership checks and operator access limited to assigned queues.

Later work: cancellation, no-show handling, multiple counters, priority queues, analytics and advance appointments. GCP deployment and completed Docker/CI/CD setup belong to Lab 5.

## Engineering documents

These documents form the Sprint 1 engineering contract:

| Document | Contents |
|---|---|
| [System specification](docs/specification.md) | Scope, actors, functional and non-functional requirements, business rules, decisions and acceptance criteria |
| [System design](docs/system-design.md) | Proposed architecture, data model, authorization, integrity and local configuration contract |
| [Feature inventory](docs/feature-inventory.md) | Features and traceability from requirements to issues, acceptance criteria and tests |
| [Core queue feature specification](docs/features/sprint-1-core-queue.md) | Customer/operator workflows, lifecycle, validation and permissions |
| [API specification](docs/api-spec.md) | Sprint 1 endpoints, payloads, authorization and errors |
| [UI specification](docs/ui-spec.md) | Screens, navigation, states and responsive behavior |
| [Test specification](docs/tests.md) | Planned unit, integration and end-to-end cases; these are specifications, not test results |

## Decisions and technology

The approved baseline is documented in `docs/specification.md`. Queue-number scope, representation and reset policy, cross-queue registration, queue availability behavior, and some measurable targets remain proposals marked **PENDING APPROVAL**. Resolve the number policy before implementing Issue #4.

The Lab 5 reference material supplied for this course describes Node.js 24, React, Express, PostgreSQL and Prisma, but the QMS application source is absent. Treat that stack as a proposal until Issue #2 inspects and records the actual implementation choices.

## Sprint issue workflow

Sprint 1 work is tracked in Issues #1-#7. Each feature branch must start from the latest verified `sprint1-staging` branch and follow `feature/sprint1/<issue-number>-<issue-name>`. Submit completed issue branches for team review before integrating them into `sprint1-staging`; do not start dependent implementation from an unmerged feature branch.
