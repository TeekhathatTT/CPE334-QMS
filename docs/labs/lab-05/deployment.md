# QMS Deployment Guide (Lab 5)

Status: **updated for Lab 5 step 6 — GitHub to GCP with Workload Identity Federation and the required-check merge gate (Issue #20)** (builds on Lab 5 steps 2–5). Section 9 records the GCP resources and the first deployment; Section 10 records WIF, the GitHub Variables, the ruleset and Check C-02. Remaining items marked `TO FILL (later Lab 5 step)` (deploy workflow, release procedure) are completed by later Lab 5 Issues.

## 1. Reference stack

> In use since Lab 5 step 5 (Issue #22). We follow the reference stack without changes. Project, region and resource names are in section 9.1.

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
| `NODE_ENV` | server | `development`, `test` or `production`. `production` serves `client/dist` and marks cookies `Secure`. | No | `server/.env` (`development`); Vitest forces `test` | Cloud Run env var `NODE_ENV=production` (`--set-env-vars`, section 9.3). |
| `DATABASE_URL` | server, Prisma CLI (migrate, seed) | PostgreSQL connection string. Required, no default; startup fails without it. | **Yes** (outside local dev) | `server/.env` (local Docker Compose database) | Secret Manager secret `qms-database-url`, injected by Cloud Run. Cloud SQL unix-socket form: `postgresql://qms_app:<password>@localhost/qms_db?host=/cloudsql/<connection name>&schema=public&connection_limit=3`. For migrate/seed from a laptop, the same URL is rewritten in the shell to the Auth Proxy (`127.0.0.1:<port>`), section 9.4. |
| `TEST_DATABASE_URL` | server tests, `npm run migrate:test`, E2E | Separate database used only when `NODE_ENV=test`; must differ from `DATABASE_URL` (tests delete all rows). | Yes, if it carries real credentials | `server/.env.test` | CI only (`.github/workflows/ci-docker.yml` PostgreSQL 16 service container `qms_test_db`). Not used by the deployed service. |
| `SESSION_SECRET` | server | HMAC key for session tokens (only the HMAC is stored in the database), at least 32 characters; the `.env.example` placeholder is refused at startup. | **Yes** | `server/.env` (generate your own) | Secret Manager secret `qms-session-secret` (64 random hex characters), injected by Cloud Run. |
| `CORS_ORIGIN` | server | Comma-separated origins allowed cross-origin. Empty means same-origin only. | No | `server/.env` (empty) | Leave empty: UI and API share one origin on Cloud Run. |
| `COMMIT_SHA` | server (`GET /api/health`) | Commit of the running build, used to check which release is live. | No | Empty (health reports `unknown`) | CI passes the first 7 characters of the commit as `--build-arg COMMIT_SHA` when building the image: the PR head commit for pull requests (`github.event.pull_request.head.sha`), otherwise `github.sha`. The image also gets it as a build argument for releases, and the Cloud Run service sets `COMMIT_SHA=<short SHA>` as an env var (section 9.3). |
| `APP_VERSION` | server (`GET /api/health`) | Optional fallback version label when `COMMIT_SHA` is unset. | No | Empty | Optional; not planned to be set. |
| `SEED_PASSWORD` | seed only (`npm run seed`) | Password for every seeded demo account, at least 12 characters. Without it the seed uses the public dev password only when `NODE_ENV` is `development` or `test`, and refuses to run otherwise. | **Yes** (outside local dev) | Not needed locally (dev password) | Set in the operator's shell when seeding Cloud SQL; shared with the team privately. Not used by the running service. |

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
| Push the image to Artifact Registry | Section 9.3 (`docker push $REGION-docker.pkg.dev/$PROJECT_ID/qms/cpe334-qms:<full SHA>`) |
| Create the Cloud SQL instance and database | Section 9.2 |
| Create the Secret Manager secrets | Section 9.2 |
| Run migrations against Cloud SQL | Section 9.4 (from a laptop through the Cloud SQL Auth Proxy) |
| Deploy to Cloud Run | Section 9.3 (`gcloud run deploy qms --image=...@sha256:<digest> ...`) |
| GitHub Actions CI workflow | `.github/workflows/ci-docker.yml` (`pull_request` to `main`, `lab5-staging`, `*-staging` or `staging/**`; `push` to `lab5-staging`; `workflow_dispatch`; see section 8.1); GCP auth smoke test `.github/workflows/gcp-auth-check.yml` (section 10.5); deploy workflow: TO FILL (later Lab 5 step) |
| Service URL | https://qms-1036193964355.asia-southeast1.run.app |

> **Note:** `docker-compose.yml` sets `name: cpe334-qms`, so Docker Compose always creates the network `cpe334-qms_default` regardless of the local clone folder name. You can verify the active network name with `docker network ls`.

## 6. Checking which commit is running

Call the health endpoint on the running instance and compare `version` with the expected commit:

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","database":"ok","version":"<COMMIT_SHA or unknown>"}
```

On Cloud Run, use the same path on the service URL and compare it with the revision's image and env var:

```bash
curl -s https://qms-1036193964355.asia-southeast1.run.app/api/health
# {"status":"ok","database":"ok","version":"<short SHA>"}
gcloud run services describe qms --region=asia-southeast1 --project=cpe334-2026-td-qms \
  --format="value(status.latestReadyRevisionName,spec.template.spec.containers[0].image)"
```

The service is deployed by digest, so `image` shows `...@sha256:<digest>`. The same digest carries the full commit SHA as its tag (section 9.3); list it with `gcloud artifacts docker images list asia-southeast1-docker.pkg.dev/cpe334-2026-td-qms/qms/cpe334-qms --include-tags`. `version`, the image tag and the commit on GitHub must match. A `503` with `"database":"unavailable"` means the app is running but cannot reach PostgreSQL; check the server logs for the cause.

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

## 8. GitHub Actions CI & Docker Workflow (Lab 5 Step 4 / R-05 / Check C-01)

### 8.1 Workflow Overview (`.github/workflows/ci-docker.yml`)

The Continuous Integration workflow in [`.github/workflows/ci-docker.yml`](../../../.github/workflows/ci-docker.yml) automatically builds, migrates, seeds, tests, and verifies the Docker image on every pull request and staging push:

- **Triggers (`on`):**
  - `pull_request` targeting `main`, `lab5-staging`, `*-staging`, and `staging/**`
  - `push` to `lab5-staging`
  - `workflow_dispatch` for manual on-demand execution
- **Permissions & Concurrency:**
  - Read-only repository token (`contents: read`).
  - Cancels superseded in-progress runs on the same ref (`${{ github.workflow }}-${{ github.ref }}`).
- **PostgreSQL 16 Service Container (`services.postgres`):**
  - Image: `postgres:16-alpine` exposed on `localhost:5432`.
  - Credentials: `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=qms_db`.
  - Health check: `pg_isready -U postgres -d qms_db` (`--health-interval=5s --health-timeout=5s --health-retries=10`) so workflow steps wait until PostgreSQL is ready before connecting.

### 8.2 CI Environment Variables

The job injects non-secret test configuration matching `.env.example` and `server/.env.test`:

| Variable | CI Value | Notes |
|---|---|---|
| `PORT` | `3000` | Default HTTP listen port |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/qms_db?schema=public&connection_limit=25` | Target database for `npm run migrate` and `npm run seed` (`NODE_ENV=development`) |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/qms_test_db?schema=public&connection_limit=25` | Isolated database for `npm run migrate:test` and `npm test` (`NODE_ENV=test`) |
| `SESSION_SECRET` | `ci_test_only_non_secret_session_key_minimum_32_characters!` | Deterministic 58-character CI-only test secret (satisfies `validateEnv()` >= 32 chars and non-placeholder check) |

### 8.3 Pipeline Steps (in Execution Order)

1. **Check out repository** (`actions/checkout@v4`)
2. **Set up Node.js 20** (`actions/setup-node@v4`, `node-version: '20'`, `cache: 'npm'`)
3. **Install workspace dependencies** (`npm ci`)
4. **Generate Prisma client** (`npm run prisma:generate`)
5. **Run database migrations** (`npx prisma db execute --url "$DATABASE_URL" --file docker/postgres-init/01-create-test-db.sql` to create `qms_test_db` inside the CI service container, `npm run migrate` for `qms_db`, and `npm run migrate:test` for `qms_test_db`)
6. **Seed database** (`NODE_ENV=development npm run seed` against `qms_db`)
7. **Run server TypeScript typecheck** (`npm run typecheck --workspace=server`)
8. **Run server integration test suites** (`NODE_ENV=test npm test` — all Vitest suites against real PostgreSQL 16 in `qms_test_db`)
9. **Run client test suites** (`npm run test:client` — Vitest + jsdom + React Testing Library)
10. **Run production build checks** (`npm run build` — compiles `server/dist` and `client/dist`)
11. **Test Docker image build** (`docker build --build-arg COMMIT_SHA=${SHA::7} -t cpe334-qms:ci .`, where `SHA` is `github.event.pull_request.head.sha` on pull requests and `github.sha` otherwise; on `pull_request` events `GITHUB_SHA` is the temporary merge commit, not a commit on the branch)

### 8.4 Check C-01 CI Verification Status

| Check | Target | Expected Result | Status |
|---|---|---|---|
| Local YAML & script validation | `.github/workflows/ci-docker.yml` | Valid GitHub Actions YAML; all `npm run` scripts and env variables match `package.json` and `server/src/config.ts` | **PASS** (verified locally 2026-11-20) |
| GitHub Actions PR run (**Check C-01**) | Pull Request `#30` to `lab5-staging` | All 11 steps in `Build, Migrate, Seed, Test & Docker Image` complete with green status (`0` exit code) | **PASS** (Run `#44741265187` — [View Run](https://github.com/TeekhathatTT/CPE334-QMS/actions/runs/44741265187/job/136305214771?pr=30)) |

## 9. GCP Infrastructure and First Deployment (Lab 5 Step 5 / Issue #22 / R-03, R-04 / Check C-04)

Done by @TeekhathatTT on 2026-11-20 and 2026-11-21 from a Windows 11 laptop with Google Cloud SDK 594.0.0 and Docker Desktop 28.5.1, under the GCP Free Trial account that owns the project. Every command that created or changed cloud state was reviewed and approved before it ran (handout Section 9). Flags follow the Lab 5 Starter Kit `deploy/deploy.sh`, adapted to QMS; differences from the kit are listed in 9.6.

### 9.1 GCP project, region and resource names

| Item | Value |
|---|---|
| Project ID (number) | `cpe334-2026-td-qms` (`1036193964355`) |
| Region | `asia-southeast1` (Singapore): kit default; the TA cost estimate is for this region |
| Enabled APIs | `run`, `sqladmin`, `artifactregistry`, `secretmanager` (`*.googleapis.com`) |
| Artifact Registry repository | `qms` (Docker), image `asia-southeast1-docker.pkg.dev/cpe334-2026-td-qms/qms/cpe334-qms:<full commit SHA>` |
| Cloud SQL instance | `qms-pg`: PostgreSQL 16, `db-f1-micro`, Enterprise edition, zonal, 10 GB SSD, storage auto-increase **off**, daily backup 03:00 UTC, public IP with **no** authorized networks |
| Cloud SQL connection name | `cpe334-2026-td-qms:asia-southeast1:qms-pg` |
| Database / application user | `qms_db` / `qms_app` |
| Secret Manager secrets | `qms-database-url` (`DATABASE_URL`), `qms-session-secret` (`SESSION_SECRET`); seed password: see 9.4 |
| Runtime service account | `qms-run@cpe334-2026-td-qms.iam.gserviceaccount.com` |
| Cloud Run service | `qms`, min instances 0, max 3, 1 CPU, 512 MiB, port 3000, public (unauthenticated) |
| Service URL | https://qms-1036193964355.asia-southeast1.run.app |

### 9.2 Infrastructure commands (run once)

Shell variables only; no value below is a secret. Passwords are generated inside the shell, sent to Secret Manager through standard input and never printed.

```bash
PROJECT_ID=cpe334-2026-td-qms
REGION=asia-southeast1
CONN=$PROJECT_ID:$REGION:qms-pg
SA=qms-run@$PROJECT_ID.iam.gserviceaccount.com

# APIs
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project=$PROJECT_ID

# Artifact Registry
gcloud artifacts repositories create qms --repository-format=docker --location=$REGION --description="CPE334 QMS container images" --project=$PROJECT_ID
gcloud auth configure-docker $REGION-docker.pkg.dev

# Cloud SQL (billed every hour it runs)
gcloud sql instances create qms-pg --database-version=POSTGRES_16 --edition=enterprise --tier=db-f1-micro \
  --region=$REGION --availability-type=zonal --storage-type=SSD --storage-size=10GB --no-storage-auto-increase \
  --backup-start-time=03:00 --project=$PROJECT_ID
gcloud sql databases create qms_db --instance=qms-pg --project=$PROJECT_ID

# Database user and secrets (values never echoed)
DB_PASS=$(openssl rand -hex 24)
SESSION=$(openssl rand -hex 32)
gcloud sql users create qms_app --instance=qms-pg --password="$DB_PASS" --project=$PROJECT_ID >/dev/null
printf '%s' "postgresql://qms_app:${DB_PASS}@localhost/qms_db?host=/cloudsql/${CONN}&schema=public&connection_limit=3" \
  | gcloud secrets create qms-database-url --data-file=- --replication-policy=automatic --project=$PROJECT_ID
printf '%s' "$SESSION" | gcloud secrets create qms-session-secret --data-file=- --replication-policy=automatic --project=$PROJECT_ID
unset DB_PASS SESSION

# Password for the seeded demo accounts (needed before the seed in 9.4; create once)
SEED_PW=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)   # 20 characters, never echoed
printf '%s' "$SEED_PW" | gcloud secrets create qms-seed-password --data-file=- --replication-policy=automatic --project=$PROJECT_ID
unset SEED_PW
# To rotate it later: add a new version the same way, then run the seed again (9.4)
#   printf '%s' "$NEW_PW" | gcloud secrets versions add qms-seed-password --data-file=- --project=$PROJECT_ID

# Runtime service account with least privilege (no Editor, not the default compute account)
gcloud iam service-accounts create qms-run --display-name="QMS Cloud Run runtime" --project=$PROJECT_ID
gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$SA --role=roles/cloudsql.client --condition=None
gcloud secrets add-iam-policy-binding qms-database-url   --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor --project=$PROJECT_ID
gcloud secrets add-iam-policy-binding qms-session-secret --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor --project=$PROJECT_ID
```

Checked afterwards (read-only): `qms-run` holds only `roles/cloudsql.client` on the project, and `roles/secretmanager.secretAccessor` only on the two secrets.

`qms-seed-password` is deliberately **not** granted to `qms-run`: the running service never seeds. Only the person who runs 9.4 reads it, with their own account (project Owner or Editor, which can access secrets). If a later deploy workflow runs the seed, grant `roles/secretmanager.secretAccessor` on `qms-seed-password` to that workflow's service account only.

### 9.3 Build, push and deploy (first manual release)

The image is tagged with the **full** commit SHA and the service is deployed **by digest** (handout Section 5, simplest way to meet R-08).

```bash
SHA=$(git rev-parse HEAD)
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/qms/cpe334-qms
docker build --build-arg COMMIT_SHA=${SHA::7} -t $IMAGE:$SHA .
docker push $IMAGE:$SHA                     # prints the digest
gcloud run deploy qms --image=$IMAGE@sha256:<digest from docker push> \
  --region=$REGION --platform=managed --allow-unauthenticated \
  --service-account=$SA --add-cloudsql-instances=$CONN \
  --set-secrets=DATABASE_URL=qms-database-url:latest,SESSION_SECRET=qms-session-secret:latest \
  --set-env-vars=NODE_ENV=production,COMMIT_SHA=${SHA::7} \
  --min-instances=0 --max-instances=3 --memory=512Mi --cpu=1 --port=3000 --project=$PROJECT_ID
```

First release:

| Item | Value |
|---|---|
| Commit | `ebb7a7467a7cd12013673a864ae89ebfa5ad746e` (branch `feature/lab5/5-gcp-first-deploy`) |
| Image | `asia-southeast1-docker.pkg.dev/cpe334-2026-td-qms/qms/cpe334-qms:ebb7a7467a7cd12013673a864ae89ebfa5ad746e` (linux/amd64, 291 MB) |
| Digest | `sha256:57e9643c4b92f682dd66e5095f307ead92664da6a3f2502f4d3e5034b485e349` |
| Revision | `qms-00001-fh7` (100% of traffic) |

### 9.4 Migrations and seed (from a laptop through the Cloud SQL Auth Proxy)

The production image contains no Prisma CLI (`prisma` is a dev dependency), so `prisma migrate deploy` cannot run inside the container. Migrations and the seed run from a checkout of the release commit, through the Cloud SQL Auth Proxy, **before** users need the new schema. Migrations are additive (`prisma migrate deploy` applies only pending migrations).

Before you start: the secret `qms-seed-password` must exist (created once in 9.2), and you must be signed in with `gcloud auth login` as a project Owner or Editor.

**Install the Cloud SQL Auth Proxy v2** (one of these; both give the same `cloud-sql-proxy` binary):

- **Google Cloud CLI component** (used here; tested on Windows 11 with Google Cloud SDK 594.0.0, component "Cloud SQL Proxy v2" version 2.26.3):
  ```bash
  gcloud components install cloud-sql-proxy
  ```
  On Windows with the Cloud SDK's bundled Python, a non-interactive shell refuses to update components (`Cannot use bundled Python installation to update Google Cloud CLI in non-interactive mode`). Run it in an interactive terminal, or first follow the command that error prints (`gcloud components copy-bundled-python`, then set `CLOUDSDK_PYTHON` to the path it returns). The binary lands in the SDK `bin` folder.
- **Direct download of the Windows binary** (no gcloud component needed):
  ```powershell
  Invoke-WebRequest https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.26.3/cloud-sql-proxy.x64.exe -OutFile cloud-sql-proxy.exe
  ```
  Check the installed version with `cloud-sql-proxy --version` (here: `2.26.3+windows.amd64`).

`--gcloud-auth` makes the proxy use the `gcloud auth login` credentials ("Use gcloud's user credentials as a source of IAM credentials", from `cloud-sql-proxy --help`), so no Application Default Credentials or key file is needed.

```bash
cloud-sql-proxy --gcloud-auth --address 127.0.0.1 --port 5434 "$CONN" &     # 5433 is used by the local Compose database
PROXY=$!
# Read the Cloud Run URL from Secret Manager and point it at the proxy, inside the shell only (never printed):
export DATABASE_URL=$(gcloud secrets versions access latest --secret=qms-database-url --project=$PROJECT_ID \
  | sed -E 's#@localhost/qms_db\?host=/cloudsql/[^&]+&#@127.0.0.1:5434/qms_db?#')
npm run migrate                                   # prisma migrate deploy
# Seed demo accounts with a private password (requires the SEED_PASSWORD change to the seed):
export SEED_PASSWORD=$(gcloud secrets versions access latest --secret=qms-seed-password --project=$PROJECT_ID)
NODE_ENV=production npm run seed
kill $PROXY; unset DATABASE_URL SEED_PASSWORD
```

- The seed used to hash a fixed password that is published in this public repository. Seeding Cloud SQL with it would let anyone sign in to the public URL. The seed now requires `SEED_PASSWORD` whenever `NODE_ENV` is not `development` or `test` (branch `fix/lab5/seed-password-env`, separate PR). The value is generated in the shell, stored only in Secret Manager as `qms-seed-password`, and shared with the team and the Lab 6 partner team privately.

Results against `qms-pg` on 2026-11-21 (Cloud SQL Auth Proxy on `127.0.0.1:5434`):

| Step | Command | Result |
|---|---|---|
| Migrate | `npm run migrate` (`prisma migrate deploy`) | Applied `20261111000000_init` and `20261112090500_auth_sessions`; "All migrations have been successfully applied." Exit 0 |
| Seed | `NODE_ENV=production npm run seed` from `fix/lab5/seed-password-env` @ `7aca1b2`, `SEED_PASSWORD` from `qms-seed-password` v1 (20 characters, never printed) | Customers `customer1@example.com`, `customer2@example.com`; operators `operator1@example.com`, `operator2@example.com`; queues `General Inquiry Desk`, `Specialized Consultation`; `operator1` assigned to `General Inquiry Desk`. Exit 0 |

### 9.5 Verification (Check C-04 / R-03)

Read-only checks with `curl` against the live URL on 2026-11-21, revision `qms-00001-fh7`, no cookies:

| Check | Command | Expected | Actual | Result |
|---|---|---|---|---|
| Health, DB connectivity and version | `curl -s $URL/api/health` | `200`, `status ok`, `database ok`, `version ebb7a74` | `200 {"status":"ok","database":"ok","version":"ebb7a74"}` | **PASS** |
| UI served from the same origin | `curl -s -o /dev/null -w "%{http_code} %{content_type}" $URL/` | `200 text/html` | `200 text/html; charset=UTF-8`, title "Queue and Service Management System (QMS)" | **PASS** |
| Client-side route on refresh | `curl ... $URL/login` | `200 text/html` | `200 text/html; charset=UTF-8` | **PASS** |
| Unknown API path | `curl -s $URL/api/unknown` | `404 RESOURCE_NOT_FOUND` JSON | `404 {"error":{"code":"RESOURCE_NOT_FOUND",...}}` | **PASS** |
| Login before migration | `POST $URL/api/auth/login` (unknown user) | `401` once the schema exists | `500`; Cloud Run log: Prisma `P2021` (`public.User` does not exist) | Expected before migration; fixed by 9.4 |
| Login after migration | `POST $URL/api/auth/login` (unknown user) | `401 UNAUTHORIZED` | `401 {"error":{"code":"UNAUTHORIZED","message":"Invalid email or password.",...}}` | **PASS** |
| Public dev password refused | `POST $URL/api/auth/login` as `customer1@example.com` with the README dev password | `401` (cloud accounts use the private `SEED_PASSWORD`) | `401 UNAUTHORIZED` | **PASS** |

Browser evidence for C-04 on 2026-11-21 (Brave, URL bar visible, no password on screen), revision `qms-00001-fh7`, commit `ebb7a74`. Screenshots are in [`evidence/`](evidence/):

| Figure | Screenshot | What it shows | Result |
|---|---|---|---|
| C-04.1 | [`c04-01-login-page.png`](evidence/c04-01-login-page.png) | `/login` served from the public Cloud Run URL (13:40) | **PASS** |
| C-04.2 | [`c04-02-customer-signed-in.png`](evidence/c04-02-customer-signed-in.png) | Sign in: `customer1@example.com`, role `CUSTOMER`, available queue `General Inquiry Desk` (13:43) | **PASS** |
| C-04.3 | [`c04-03-customer-joined-queue-1.png`](evidence/c04-03-customer-joined-queue-1.png) | Main business action (customer): "You joined General Inquiry Desk.", queue number `1`, status `Waiting` (13:45) | **PASS** |
| C-04.4 | [`c04-04-duplicate-join-rejected.png`](evidence/c04-04-duplicate-join-rejected.png) | Rule rejection: joining the same queue again shows "You already have an active entry in this queue." (`409 DUPLICATE_ACTIVE_ENTRY`) (13:46) | **PASS** |
| C-04.5 | [`c04-05-operator-signed-in.png`](evidence/c04-05-operator-signed-in.png) | Sign in: `operator1@example.com`, role `OPERATOR`, assigned queue `General Inquiry Desk` (13:46) | **PASS** |
| C-04.6 | [`c04-06-operator-queue-before-call-next.png`](evidence/c04-06-operator-queue-before-call-next.png) | Operator queue view: `Waiting: 1`, entry #1 for customer `11111111-…` joined 1:45:35 PM, **before** Call Next (13:46) | **PASS** (data from the customer is visible to the operator) |
| C-04.7 | [`c04-07-operator-call-next.png`](evidence/c04-07-operator-call-next.png) | Main business action (operator): **Call Next** shows "Called queue number 1."; entry #1 moves to Active Service with status `Called` (called 1:53:31 PM); counters `Waiting: 0 · Active: 1 · Completed: 0` (13:53) | **PASS** |

### 9.6 Choices that differ from the Starter Kit, and cost control

| Kit | QMS | Reason |
|---|---|---|
| `gcloud builds submit` (Cloud Build), tag `latest` | Local `docker build` + `docker push`, tag = full commit SHA, deploy by digest | No Cloud Build API or extra IAM needed; R-08 traceability from the first release |
| Migration + seed as a Cloud Run job inside the image | Laptop + Cloud SQL Auth Proxy | The QMS image has no Prisma CLI; the deploy workflow (later Lab 5 step) may revisit this |
| `--storage-auto-increase` left at default (on) | `--no-storage-auto-increase`, `--availability-type=zonal` | Handout Sections 5 and 10 cost control |
| Generated admin password in Secret Manager | `SEED_PASSWORD` in Secret Manager (`qms-seed-password`) | Same idea for QMS demo accounts (handout Section 5) |

Cost (TA estimate for `asia-southeast1`, 21 Oct 2026): Cloud SQL `db-f1-micro` + 10 GB SSD ≈ USD 0.43 per day while running; Cloud Run scales to zero; registry and secrets within the free tier. A budget alert exists on the billing account. Between work sessions the instance is stopped and started again with:

```bash
gcloud sql instances patch qms-pg --activation-policy=NEVER  --project=$PROJECT_ID   # stop (disk, backups and IP are still billed)
gcloud sql instances patch qms-pg --activation-policy=ALWAYS --project=$PROJECT_ID   # start before use, Lab 6 UAT and grading
```

While the instance is stopped, the UI loads but every database request fails. Keep it running during grading (handout Section 12). Tear down only after the course ends.

## 10. GitHub to GCP with Workload Identity Federation, and the Merge Gate (Lab 5 Step 6 / Issue #20 / R-06 / Check C-02)

Done by @TeekhathatTT on 2026-11-21 and 2026-11-22. Every command that created or changed GCP or GitHub state was shown, explained and approved before it ran (handout Section 9). No service account key was created at any point; GitHub signs in with a short-lived OIDC token. Cloud SQL does not need to run for anything in this section.

Sources used for flags, roles and settings: Google Cloud "Workload Identity Federation with deployment pipelines" and "Cloud Run IAM roles"; the `google-github-actions/auth` README and releases; GitHub REST "Repository rules".

### 10.1 What was created

| Item | Value |
|---|---|
| APIs enabled for WIF | `iam`, `iamcredentials`, `sts`, `cloudresourcemanager` (`*.googleapis.com`) |
| Workload identity pool | `github` (location `global`) |
| OIDC provider | `qms-repo`, issuer `https://token.actions.githubusercontent.com` |
| Provider resource name | `projects/1036193964355/locations/global/workloadIdentityPools/github/providers/qms-repo` |
| Attribute mapping | `google.subject=assertion.sub`, `attribute.repository=assertion.repository`, `attribute.repository_id=assertion.repository_id`, `attribute.repository_owner_id=assertion.repository_owner_id`, `attribute.ref=assertion.ref` |
| Attribute condition | `assertion.repository_id=='1445593383' && assertion.repository_owner_id=='45238320'`: the numeric IDs of `TeekhathatTT/CPE334-QMS` and its owner. Tokens from any other repository are rejected, and a re-created repository with the same name gets a new ID (the GCP page recommends ID claims over name claims) |
| GitHub service account | `qms-github@cpe334-2026-td-qms.iam.gserviceaccount.com`: dedicated, not `qms-run` and not the default compute account; no user-managed keys (`keys list --managed-by=user` returns 0 items) |
| Smoke-test workflow | `.github/workflows/gcp-auth-check.yml` |
| Repository ruleset | `R-06 merge gate (main and staging)`, id `27801092` |

### 10.2 GCP commands (run once)

```bash
PROJECT_ID=cpe334-2026-td-qms
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
REGION=asia-southeast1
REPO=TeekhathatTT/CPE334-QMS
GH_SA=qms-github@$PROJECT_ID.iam.gserviceaccount.com

gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com --project=$PROJECT_ID

gcloud iam workload-identity-pools create github --project=$PROJECT_ID --location=global \
  --display-name="GitHub Actions" --description="GitHub Actions OIDC for $REPO"

gcloud iam workload-identity-pools providers create-oidc qms-repo --project=$PROJECT_ID \
  --location=global --workload-identity-pool=github --display-name="CPE334-QMS repo" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository_id=='1445593383' && assertion.repository_owner_id=='45238320'"

gcloud iam service-accounts create qms-github --project=$PROJECT_ID \
  --display-name="GitHub Actions (QMS)" --description="Impersonated by GitHub Actions via WIF; no keys"

# Only workflows of this repository may impersonate the account (binding on the account, not the project)
gcloud iam service-accounts add-iam-policy-binding $GH_SA --project=$PROJECT_ID \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

# Read-only access on the qms service only (enough for the smoke test)
gcloud run services add-iam-policy-binding qms --project=$PROJECT_ID --region=$REGION \
  --member="serviceAccount:$GH_SA" --role=roles/run.viewer
```

### 10.3 Roles of `qms-github`

| Role | Scope | Status | Why |
|---|---|---|---|
| `roles/iam.workloadIdentityUser` | the `qms-github` account; member `principalSet://.../attribute.repository/TeekhathatTT/CPE334-QMS` | **Granted** | Lets this repository's workflows exchange their OIDC token for the account |
| `roles/run.viewer` | Cloud Run service `qms` | **Granted** | `gcloud run services describe qms` in the smoke test |
| `roles/artifactregistry.writer` | Artifact Registry repository `qms` | Planned for step 7, **not granted** | Push the release image |
| `roles/run.developer` | Cloud Run service `qms` | Planned for step 7, **not granted** | Deploy a new revision (no `setIamPolicy`, unlike `run.admin`) |
| `roles/iam.serviceAccountUser` | the runtime account `qms-run` only | Planned for step 7, **not granted** | Deploy a revision that runs as `qms-run` |

Branch scope: the impersonation binding is repository-wide for now, because the account is read-only and the smoke test runs from a feature branch. When step 7 adds the write roles, narrow the binding to `principalSet://.../attribute.ref/refs/heads/main` (the provider condition already limits tokens to this repository), so only `main` can deploy.

### 10.4 GitHub repository Variables

Non-secret identifiers, stored under **Settings → Secrets and variables → Actions → Variables** (not Secrets; there is no JSON key secret): `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `CLOUD_RUN_SERVICE`. Their values match 9.1 and 10.1. Set with `gh variable set <NAME> -R TeekhathatTT/CPE334-QMS --body "<value>"` and checked with `gh variable list`.

### 10.5 Connection smoke test (`gcp-auth-check.yml`)

- Permissions `contents: read` and `id-token: write` only; every action pinned to a full commit SHA (`actions/checkout` v7.0.1, `google-github-actions/auth` v3.0.0, `google-github-actions/setup-gcloud` v3.0.1).
- Triggers: `workflow_dispatch`, and `push` to `feature/lab5/6-wif-merge-gate` when the workflow file changes. It never runs on `pull_request`, so code from a fork never gets cloud access. GitHub offers a manual `workflow_dispatch` run only once the file is on the default branch (`main`); until then the branch-limited `push` trigger runs it.
- Runs one read-only command and prints only the service name, latest revision and URL.

| Run | Result | Cause |
|---|---|---|
| [Run 44926093682](https://github.com/TeekhathatTT/CPE334-QMS/actions/runs/44926093682), attempts 1 and 2, commit `a23e69e` | Failure at the auth step: `must specify exactly one of "workload_identity_provider" or "credentials_json"` | The repository Variables did not exist yet (`gh variable list` was empty) |
| Same run, attempt 3, after the Variables were created | **PASS** | Signed in as `qms-github@cpe334-2026-td-qms.iam.gserviceaccount.com` through WIF; `gcloud run services describe qms` returned service `qms`, latest ready revision `qms-00001-fh7`; the action removed its short-lived credentials file at the end |

### 10.6 Merge gate (R-06)

Repository ruleset `R-06 merge gate (main and staging)` (id `27801092`), created with `gh api -X POST repos/TeekhathatTT/CPE334-QMS/rulesets` and read back with `gh api repos/TeekhathatTT/CPE334-QMS/rulesets/27801092`:

| Setting | Value read back |
|---|---|
| Enforcement | `active` |
| Branches | `refs/heads/main`, `refs/heads/lab5-staging`, `refs/heads/lab6-staging` |
| Bypass actors | none (`current_user_can_bypass: never`, including the repository admin) |
| Pull request | required; `required_approving_review_count: 1`; `dismiss_stale_reviews_on_push: true`; code owner review off; merge methods merge, squash, rebase. `require_extra_approval_for_unattributed_changes: true` is a GitHub default, not set by us |
| Required status check | `Build, Migrate, Seed, Test & Docker Image` from the GitHub Actions app (`integration_id` 15368); `strict_required_status_checks_policy: false` (branches need not be up to date, to avoid re-running CI on every open PR after each merge) |
| Force push / deletion | blocked (`non_fast_forward`, `deletion`) |

The required check uses the exact name GitHub shows for the job in `ci-docker.yml` (job id `build-test-and-docker`), read from a real check run. The handout's "test-and-docker" is only an example name.

What this means for every Pull Request into `main`, `lab5-staging` or `lab6-staging`: CI must pass and the teammate must approve (the author's own approval does not count, R-09); a new push removes an earlier approval; nobody can push directly to these branches or skip the check.

### 10.7 Check C-02 (R-06)

| Item | Value |
|---|---|
| Pull Request | [#33](https://github.com/TeekhathatTT/CPE334-QMS/pull/33) `[C-02 DEMO, DO NOT MERGE]`, from the temporary branch `tmp/lab5-c02-failing-check` into `lab5-staging`, label `lab5` |
| Commit | `36c0783` (one new file `server/tests/c02-demo-failing.test.ts`; no existing test or application code changed) |
| Failed run | [Run 44927871890](https://github.com/TeekhathatTT/CPE334-QMS/actions/runs/44927871890/job/136917840870): `Build, Migrate, Seed, Test & Docker Image` failed after 59 s at `tests/c02-demo-failing.test.ts:9` (`AssertionError: expected 2 to be 3`); Test Files 1 failed, 12 passed; Tests 1 failed, 140 passed |
| Merge state | `mergeStateStatus: BLOCKED` (GitHub API); merge button disabled |
| Outcome | PR closed without merging; branch, commit and run kept (R-10); `lab5-staging` and `main` unchanged |

| Figure | Screenshot | What it shows | Result |
|---|---|---|---|
| C-02.1 | [`c02-01-required-check-failed-merge-blocked.png`](evidence/c02-01-required-check-failed-merge-blocked.png) | PR #33 from a temporary branch: the required check `CI & Docker Build / Build, Migrate, Seed, Test & Docker Image (pull_request)` (badge "Required") failed after 59 s, "Merging is blocked", and the merge button is disabled. Commit `36c0783` | **PASS** |
