# Queue and Service Management System (QMS)

QMS is a high-reliability queue and service management application for service counters. It supports customer queue registration, personal ticket tracking, and operator-managed service workflows in strict FIFO order with transactional concurrency control.

## Documentation Set

- [docs/srs.md](docs/srs.md) — Software Requirements Specification & domain narrative
- [docs/features.md](docs/features.md) — Feature inventory & delivery status
- [docs/traceability.md](docs/traceability.md) — Requirement-to-feature-to-test traceability
- [docs/system-sds.md](docs/system-sds.md) — System Design Specification, logical model, and integrity rules
- [docs/sprints/plan.md](docs/sprints/plan.md) — Sprint plans & execution schedule
- [docs/sprints/sprint-1/api-spec.md](docs/sprints/sprint-1/api-spec.md) — Sprint 1 REST API specification
- [docs/sprints/sprint-1/ui-spec.md](docs/sprints/sprint-1/ui-spec.md) — User interface workflow specification
- [docs/sprints/sprint-1/tests.md](docs/sprints/sprint-1/tests.md) — Test specifications and acceptance criteria

---

## Architecture & Layout

```
.
├── docker-compose.yml       # Local PostgreSQL database container configuration
├── .env.example             # Documented environment variables matching Section 7 of system-sds.md
├── package.json             # Root npm workspace manifest (server & client)
├── server/                  # Backend service
│   ├── prisma/
│   │   ├── schema.prisma    # PostgreSQL Prisma schema with enums, models & relations
│   │   ├── migrations/      # DDL migrations including custom CHECKs and partial UNIQUE index
│   │   └── seed.ts          # Idempotent seed script (upsert)
│   ├── src/
│   │   ├── app.ts           # Production Express application (base middlewares & error handling)
│   │   ├── server.ts        # Server entry point
│   │   ├── db.ts            # Prisma client instance (supports isolated test DB)
│   │   ├── middleware/      # RequestId, RequestLogger, UUIDv4 validator, Zod validator, Auth/RBAC
│   │   └── errors/          # Standard AppError and SDS-conforming error codes
│   └── tests/               # Vitest real database integration test suite
└── client/                  # Frontend SPA
    ├── src/                 # React 18, Vite, TypeScript, and Tailwind CSS
    └── vite.config.ts       # Vite config with API proxy
```

---

## Clean Checkout & Local Setup Guide

Follow these steps to run a clean checkout and verify the foundational setup:

### 1. Prerequisites
- **Node.js**: v20 or higher (v24 LTS recommended)
- **npm**: v10 or higher
- **Docker & Docker Compose** (for local PostgreSQL container) OR a local PostgreSQL 16+ instance.

### 2. Clone and Configure Environment
Clone the repository and copy the environment configuration:
```bash
# Clone the repository and switch to feature branch
git checkout feature/sprint1/2-project-foundation

# Configure environment variables
cp .env.example .env
cp .env.example server/.env
cp .env.example server/.env.test
```

> [!IMPORTANT]
> **Never commit session secrets or use placeholder keys in production.** Generate your own cryptographically secure secret (minimum 32 characters) for `SESSION_SECRET` rather than copying default keys:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

Ensure `.env` matches your local database credentials:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qms_db?schema=public
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qms_test_db?schema=public
SESSION_SECRET=<YOUR_GENERATED_SECURE_RANDOM_SESSION_SECRET_AT_LEAST_32_CHARS>
```

### 3. Start PostgreSQL Database
Using Docker Compose:
```bash
docker compose up -d
```
Verify PostgreSQL is ready to accept connections on port `5432`.

### 4. Install Dependencies & Generate Prisma Client
From the repository root:
```bash
npm install
npm run prisma:generate
```

### 5. Apply Database Migrations
Run the initial migration containing all database models, foreign keys, CHECK constraints, and partial unique indexes:
```bash
# Apply migrations to development database
npm run migrate

# Apply migrations to test database (if using separate database)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qms_test_db?schema=public npm run migrate
```

### 6. Seed Initial Data (Idempotent)
Execute the seed script to provision test accounts and queues:
```bash
npm run seed
```

This provisions:
- **Default Password**: `Password123!` (salted bcrypt, 10 rounds)
- **Customer Accounts (RFC 4122 UUIDv4)**:
  - `customer1@example.com` (`11111111-1111-4111-8111-111111111111`, Role: `CUSTOMER`, Status: `ACTIVE`)
  - `customer2@example.com` (`22222222-2222-4222-8222-222222222222`, Role: `CUSTOMER`, Status: `ACTIVE`)
- **Operator Accounts (RFC 4122 UUIDv4)**:
  - `operator1@example.com` (`33333333-3333-4333-8333-333333333333`, Role: `OPERATOR`, Status: `ACTIVE`)
  - `operator2@example.com` (`44444444-4444-4444-8444-444444444444`, Role: `OPERATOR`, Status: `ACTIVE`)
- **Service Queues (RFC 4122 UUIDv4)**:
  - `General Inquiry Desk` (`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, `OPEN`, `lastQueueNumber: 0`)
  - `Specialized Consultation` (`bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`, `CLOSED`, `lastQueueNumber: 0`)
- **Operator Assignment**:
  - `operator1` assigned to `General Inquiry Desk` only (`operator2` unassigned).

*Note: Repeated runs of `npm run seed` will preserve any advanced `lastQueueNumber` counter without resetting it to 0, maintaining the non-decreasing invariant specified in SDS §3.2.*

---

## Running Development Servers

To start both server and client development servers:
```bash
# Start backend API (runs on http://localhost:3000)
npm run dev:server

# In a separate terminal, start frontend client (runs on http://localhost:5173)
npm run dev:client
```

---

## Running Tests & Typechecks

Execute tests across the test suite:
```bash
# Run Vitest test suite against real isolated test database (qms_test_db)
npm run test

# Run TypeScript type checking across both production and test files
npm run typecheck --workspace=server
npx tsc --noEmit --project client/tsconfig.json

# Run production build
npm run build

# Start production server
npm start --workspace=server
```

---

## Status
Branch `feature/sprint1/2-project-foundation` implements Issue #2 (Project Foundation and Database Setup), conforming strictly to the Sprint 1 SRS, SDS, API Specification, and Test Specification.
