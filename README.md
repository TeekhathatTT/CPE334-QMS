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
│   │   ├── app.ts           # Express application with error envelopes & UUID validation
│   │   ├── server.ts        # Server entry point
│   │   ├── db.ts            # Prisma client instance
│   │   ├── middleware/      # RequestId, UUIDv4 validator, Error handler
│   │   └── errors/          # Standard AppError and error codes
│   └── tests/               # Vitest & Supertest integration suite
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
```

Ensure `.env` matches your local database credentials:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qms_db?schema=public
SESSION_SECRET=super_secret_session_key_minimum_32_chars!
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
npm run migrate
```

### 6. Seed Initial Data (Idempotent)
Execute the seed script to provision test accounts and queues:
```bash
npm run seed
```

This provisions:
- **Default Password**: `Password123!` (salted bcrypt, 10 rounds)
- **Customer Accounts**:
  - `customer1@example.com` (`11111111-1111-1111-1111-111111111111`, ACTIVE)
  - `customer2@example.com` (`22222222-2222-2222-2222-222222222222`, ACTIVE)
- **Operator Accounts**:
  - `operator1@example.com` (`33333333-3333-3333-3333-333333333333`, ACTIVE)
  - `operator2@example.com` (`44444444-4444-4444-4444-444444444444`, ACTIVE)
- **Service Queues**:
  - `General Inquiry Desk` (`aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, `OPEN`)
  - `Specialized Consultation` (`bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`, `CLOSED`)
- **Operator Assignment**:
  - `operator1` assigned to `General Inquiry Desk` only.

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
# Run Vitest test suite
npm run test

# Run production build and type checking across workspaces
npm run build
```

---

## Status
Branch `feature/sprint1/2-project-foundation` implements Issue #2 (Project Foundation and Database Setup), conforming strictly to the Sprint 1 SRS, SDS, API Specification, and Test Specification.
