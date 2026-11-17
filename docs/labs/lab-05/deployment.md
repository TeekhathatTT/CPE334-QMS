# QMS Deployment Guide (Lab 5)

Status: **initial draft** (Lab 5 step 2, Issue #17). Sections marked `TO FILL (later Lab 5 step)` are completed by the later Lab 5 Issues; nothing in them has been created or run yet.

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
| Build the container image | TO FILL (later Lab 5 step) |
| Run the container locally | TO FILL (later Lab 5 step) |
| Push the image to Artifact Registry | TO FILL (later Lab 5 step) |
| Create the Cloud SQL instance and database | TO FILL (later Lab 5 step) |
| Create the Secret Manager secrets | TO FILL (later Lab 5 step) |
| Run migrations against Cloud SQL | TO FILL (later Lab 5 step) |
| Deploy to Cloud Run | TO FILL (later Lab 5 step) |
| GitHub Actions CI and deploy workflows | TO FILL (later Lab 5 step) |
| Service URL | TO FILL (later Lab 5 step) |

## 6. Checking which commit is running

Call the health endpoint on the running instance and compare `version` with the expected commit:

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","database":"ok","version":"<COMMIT_SHA or unknown>"}
```

On Cloud Run, use the same path on the service URL (TO FILL (later Lab 5 step)). A `503` with `"database":"unavailable"` means the app is running but cannot reach PostgreSQL; check the server logs for the cause.
