# QMS Deployment Guide (Lab 5)

Status: **updated for Lab 5 step 3 — Containerization & Check C-03 verified** (builds on Lab 5 step 2, Issue #17). Remaining cloud sections marked `TO FILL (later Lab 5 step)` are completed by later Lab 5 Issues.

## 1. Reference stack (planned target)

> This is the **planned** deployment target for Lab 5. None of these cloud resources exist yet, and no resource names, project IDs, regions or URLs have been chosen in this repository.

| Component | Planned service | Role |
|---|---|---|
| Container images | Google Artifact Registry | Stores the QMS application image built from this repository. |
| Runtime | Google Cloud Run | Runs one container that serves both the API (`/api/...`) and the built React client on the same origin. |
| Database | Google Cloud SQL for PostgreSQL | Production PostgreSQL database used through `DATABASE_URL`. |
| Secrets | Google Secret Manager | Holds `DATABASE_URL` and `SESSION_SECRET` for the Cloud Run service. |
| CI/CD | GitHub Actions | Builds and tests on every Pull Request, then builds, pushes and deploys the image, passing the commit SHA as `COMMIT_SHA`. |

## 2. What this step (Issue #17) changes in the app

1. **Single-origin static serving.** With `NODE_ENV=production`, Express serves the built client from `client/dist` and returns `index.html` for any `GET` outside `/api` (client-side routes such as `/customer` work on refresh). `/api/...` behaves exactly as before, including the JSON `404 RESOURCE_NOT_FOUND` envelope for unknown API paths. If `client/dist/index.html` is missing, the server refuses to start with `Client build not found: ...`. In development the Vite dev server and its `/api` proxy are used instead; tests never serve static files.
2. **Health and version endpoint.** `GET /api/health` (no login, no CSRF token) runs a single `SELECT 1` and returns:
   - `200 {"status":"ok","database":"ok","version":"<COMMIT_SHA>"}` when the database answers;
   - `503 {"status":"degraded","database":"unavailable","version":"<COMMIT_SHA>"}` when it does not. The real error is only written to the server log.
   `version` is `COMMIT_SHA`, else `APP_VERSION`, else `"unknown"`. No other configuration value is ever returned.
3. **Environment configuration.** All runtime settings are read from environment variables (table below). `.env.example` (repository root and `server/`) lists each one with placeholder values only.

## 3. Environment variables

| Variable | Used by | Purpose | Secret? | Local development | Planned cloud source |
|---|---|---|---|---|---|
| `PORT` | server | HTTP listen port; default `3000`. | No | `server/.env` | Set by the platform (Cloud Run injects `PORT`). |
| `NODE_ENV` | server | `development`, `test` or `production`. `production` serves `client/dist` and marks cookies `Secure`. | No | `server/.env` (`development`); Vitest forces `test` | Set on the service (`production`). TO FILL (later Lab 5 step): exact deploy setting. |
| `DATABASE_URL` | server, Prisma CLI (migrate, seed) | PostgreSQL connection string. Required, no default; startup fails without it. | **Yes** (outside local dev) | `server/.env` (local Docker Compose database) | Secret Manager. TO FILL (later Lab 5 step): secret name and Cloud SQL connection form. |
| `TEST_DATABASE_URL` | server tests, `npm run migrate:test`, E2E | Separate database used only when `NODE_ENV=test`; must differ from `DATABASE_URL` (tests delete all rows). | Yes, if it carries real credentials | `server/.env.test` | CI only. TO FILL (later Lab 5 step): CI database setup. Not used by the deployed service. |
| `SESSION_SECRET` | server | HMAC key for session tokens (only the HMAC is stored in the database), at least 32 characters; the `.env.example` placeholder is refused at startup. | **Yes** | `server/.env` (generate your own) | Secret Manager. TO FILL (later Lab 5 step): secret name. |
| `CORS_ORIGIN` | server | Comma-separated origins allowed cross-origin. Empty means same-origin only. | No | `server/.env` (empty) | Leave empty: UI and API share one origin on Cloud Run. |
| `COMMIT_SHA` | server (`GET /api/health`) | Commit of the running build, used to check which release is live. | No | Empty (health reports `unknown`) | CI passes the Git commit SHA at deploy time. TO FILL (later Lab 5 step): workflow step. |
| `APP_VERSION` | server (`GET /api/health`) | Optional fallback version label when `COMMIT_SHA` is unset. | No | Empty | Optional; not planned to be set. |

The client reads no environment variables at build or run time (`import.meta.env` is not used). It calls the API with relative `/api/...` paths, so it always uses the origin it was loaded from.

Dev and test tooling only (not read by the deployed app): `client/vite.config.ts` proxies `/api` to `http://localhost:3000` on dev port `5173`; `e2e/playwright.config.ts` uses the same local ports and reads `CI`; the E2E summary reporter reads `E2E_SUMMARY_APPEND`; the REL-001 check reads `REL_PG_IMAGE`.

## 4. Local commands (exist in this repository today)

All commands run from the repository root unless noted. See the [README](../../../README.md) for the full first-time setup.

| Task | Command |
|---|---|
| Start the local PostgreSQL (Docker Compose, creates `qms_db` and `qms_test_db`) | `docker compose up -d` |
| Configure environment | `cp .env.example server/.env` and `cp .env.example server/.env.test`, then set `SESSION_SECRET` (and the URLs if your database differs) |
| Generate a session secret | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Install dependencies | `npm install` |
| Generate the Prisma client | `npm run prisma:generate` |
| Apply migrations (dev database) | `npm run migrate` |
| Apply migrations (test database) | `npm run migrate:test` |
| Seed demo data (idempotent) | `npm run seed` |
| Build server and client | `npm run build` |
| Server typecheck (source and tests) | `npm run typecheck --workspace=server` |
| Server tests (Vitest, real test database) | `npm run test:server` |
| Client tests | `npm run test:client` |
| E2E tests (Playwright, Chromium) | `npm run test:e2e` |
| Run in development (API on `:3000`) | `npm run dev` |
| Run the client dev server (`:5173`, proxies `/api`) | `npm run dev:client` |
| Run the built app in production mode on one origin | `npm run build`, then start the server with `NODE_ENV=production` and the variables above: `npm run start --workspace=server` |

Production mode needs `DATABASE_URL` and a real `SESSION_SECRET` in the environment (or in `server/.env`). Set `COMMIT_SHA` if you want `/api/health` to report a version.

## 5. Container and cloud commands

| Task | Command |
|---|---|
| Build the container image | `docker build --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) -t cpe334-qms:local .` |
| Run the container locally (with `qms-postgres` from Docker Compose) | `docker run --rm --name cpe334-qms --network cpe334-qms_default -p 3000:3000 -e PORT=3000 -e NODE_ENV=production -e "DATABASE_URL=postgresql://postgres:postgres@qms-postgres:5432/qms_db?schema=public" -e "SESSION_SECRET=<at-least-32-char-random-secret>" -e COMMIT_SHA=$(git rev-parse --short HEAD) cpe334-qms:local` |
| Push the image to Artifact Registry | TO FILL (later Lab 5 step) |
| Create the Cloud SQL instance and database | TO FILL (later Lab 5 step) |
| Create the Secret Manager secrets | TO FILL (later Lab 5 step) |
| Run migrations against Cloud SQL | TO FILL (later Lab 5 step) |
| Deploy to Cloud Run | TO FILL (later Lab 5 step) |
| GitHub Actions CI and deploy workflows | TO FILL (later Lab 5 step) |
| Service URL | TO FILL (later Lab 5 step) |

> **Note:** `docker-compose.yml` sets `name: cpe334-qms`, so Docker Compose always creates the network `cpe334-qms_default` regardless of the local clone folder name. You can verify the active network name with `docker network ls`.

## 6. Checking which commit is running

Call the health endpoint on the running instance and compare `version` with the expected commit:

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","database":"ok","version":"<COMMIT_SHA or unknown>"}
```

On Cloud Run, use the same path on the service URL (TO FILL (later Lab 5 step)). A `503` with `"database":"unavailable"` means the app is running but cannot reach PostgreSQL; check the server logs for the cause.

## 7. Containerization & Check C-03 Local Verification (Lab 5 Step 3)

### 7.1 `.dockerignore` Exclusions

The root [`.dockerignore`](../../../.dockerignore) keeps the build context small (~399 kB) and prevents secrets or local state from entering any image layer:

- **Dependencies & workspace lock artifacts:** `node_modules/`, `**/node_modules/`, `server/package-lock.json`, `client/package-lock.json`
- **Secrets & environment files:** `.env`, `.env.*`, `**/.env`, `**/.env.*`
- **Build & cache outputs:** `dist/`, `**/dist/`, `build/`, `**/build/`, `*.tsbuildinfo`
- **Test suites, E2E artifacts & coverage:** `e2e/`, `server/tests/`, `client/src/test/`, `**/*.test.*`, `**/*.spec.*`, `coverage/`, `test-results/`, `playwright-report/`
- **Local database volumes & VCS/editor metadata:** `.pgdata/`, `.*pgdata*/`, `test-pgdata/`, `.git/`, `.github/`, `.vscode/`, `.idea/`, `docs/`, `docker/`, `docker-compose.yml`, `README.md`

### 7.2 Multi-Stage `Dockerfile` Architecture

The root [`Dockerfile`](../../../Dockerfile) uses three `node:20-bookworm-slim` stages for Prisma/OpenSSL and prebuilt `bcrypt` compatibility:

1. **Stage 1 — `builder` (`node:20-bookworm-slim`):**
   - Installs `openssl` and `ca-certificates`.
   - Copies `package.json`, `package-lock.json`, `server/package.json`, and `client/package.json`, then runs `npm ci`.
   - Copies `server/prisma` and generates the typed Prisma Client (`npm run prisma:generate`).
   - Copies `server` and `client` sources and runs `npm run build` (`tsc` for `server/dist` and `tsc && vite build` for `client/dist`).
2. **Stage 2 — `prod-deps` (`node:20-bookworm-slim`):**
   - Runs `npm ci --omit=dev --workspace=server --include-workspace-root=false` so only backend production dependencies remain (`@prisma/client`, `bcrypt`, `cookie-parser`, `cors`, `dotenv`, `express`, `uuid`, `zod`).
   - Copies the generated Prisma Client engine (`node_modules/.prisma` and `node_modules/@prisma/client`) from `builder`.
3. **Stage 3 — `runtime` (`node:20-bookworm-slim`):**
   - Installs only `openssl` and `ca-certificates` for Prisma's query engine at runtime.
   - Sets `NODE_ENV=production`, `PORT=3000`, and optional `COMMIT_SHA` (via `ARG COMMIT_SHA`).
   - Copies production `node_modules` (including `server/node_modules`), `server/prisma`, `server/dist`, and `client/dist` preserving the relative layout (`server/dist` -> `../../client/dist`) expected by `server/src/staticClient.ts`.
   - Drops privileges to the non-root `node` user, exposes port `3000`, and starts the server with `CMD ["node", "server/dist/server.js"]`.

### 7.3 Building and Running the Container Locally

1. **Start PostgreSQL via Docker Compose** (and ensure migrations/seed have been applied to `qms_db`):
   ```bash
   docker compose up -d
   npm run migrate
   npm run seed
   ```
   > **Upgrading from an older checkout:** before `name: cpe334-qms` was added, Compose used the clone folder name as the project name (for example `qms`). If that older stack is still around:
   > - `docker compose up -d` fails with `container name "/qms-postgres" is already in use`. Remove the old container first with `docker rm -f qms-postgres` (or `docker compose -p <old-folder-name> down`).
   > - The new project uses a new, empty volume (`cpe334-qms_qms_postgres_data` instead of `<old-folder-name>_qms_postgres_data`), so run `npm run migrate` and `npm run seed` again. The old volume is kept; delete it with `docker volume rm <old-folder-name>_qms_postgres_data` only when you no longer need its data.
2. **Build the QMS image from the repository root:**
   ```bash
   docker build --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) -t cpe334-qms:local .
   ```
3. **Run the container connected to `qms-postgres`** (using `.env.example` keys with a real 32+ character `SESSION_SECRET` and the Docker network hostname `qms-postgres:5432`):
   ```bash
   docker run -d --name cpe334-qms-verify \
     --network cpe334-qms_default \
     -p 3000:3000 \
     -e PORT=3000 \
     -e NODE_ENV=production \
     -e "DATABASE_URL=postgresql://postgres:postgres@qms-postgres:5432/qms_db?schema=public" \
     -e "SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
     -e COMMIT_SHA=$(git rev-parse --short HEAD) \
     cpe334-qms:local
   ```
   *(Because `docker-compose.yml` defines `name: cpe334-qms`, the Compose network is always named `cpe334-qms_default`; verify with `docker network ls`. If `localhost:3000` on the host is already in use by a local dev server, map `-p 3100:3000` and probe `http://localhost:3100`.)*

### 7.4 Check C-03 Local Verification Log

**Execution Date:** 2026-11-20  
**Image Tag:** `cpe334-qms:local` (`sha256:430529520409...`, 107 MB compressed / 421 MB disk usage, build context 399.25 kB)  
**Database Container:** `qms-postgres` (`postgres:16-alpine` on network `cpe334-qms_default`)

| Check | Command / Request | Expected | Actual Result | Status |
|---|---|---|---|---|
| Image build | `docker build -t cpe334-qms:local .` | Multi-stage build succeeds (`npm ci`, `prisma:generate`, `npm run build`, runtime stage) | Exited `0`; built `server/dist` and `client/dist` (`index.html`, hashed JS/CSS) | **PASS** |
| Container startup | `docker logs cpe334-qms-verify` | `validateEnv()` passes; server listens on `PORT=3000` | `[QMS Server] Running on http://localhost:3000` | **PASS** |
| Health & DB readiness | `GET /api/health` | `200 OK` JSON with `status: "ok"`, `database: "ok"`, `version` | `200 OK` `{"status":"ok","database":"ok","version":"a619d49"}` | **PASS** |
| Root SPA HTML | `GET /` | `200 OK` `text/html` serving `client/dist/index.html` | `200 OK` (`Content-Type: text/html; charset=UTF-8`, `<div id="root"></div>`) | **PASS** |
| SPA deep-link fallback | `GET /customer` | `200 OK` `text/html` serving `client/dist/index.html` | `200 OK` (`Content-Type: text/html; charset=UTF-8`, `<div id="root"></div>`) | **PASS** |
| API 404 envelope | `GET /api/unknown` | `404 Not Found` JSON `RESOURCE_NOT_FOUND` (not `index.html`) | `404 Not Found` `{"error":{"code":"RESOURCE_NOT_FOUND","message":"Route GET /api/unknown not found.","requestId":"550609d4-1a5d-47dc-b038-2c53679428fd"}}` | **PASS** |
| Authenticated DB query (`bcrypt` + Prisma) | `POST /api/auth/login` (`customer1@example.com`) | `200 OK` with user identity and session cookies | `200 OK` `{"data":{"user":{"id":"11111111-1111-4111-8111-111111111111","email":"customer1@example.com","role":"CUSTOMER"}}}` | **PASS** |
| Cleanup | `docker rm -f cpe334-qms-verify` | Temporary verification container removed | Container `cpe334-qms-verify` stopped and removed | **PASS** |

