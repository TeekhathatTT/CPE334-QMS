# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: builder — Install workspace dependencies, generate Prisma Client,
# and compile both the backend (server/dist) and frontend (client/dist).
# ==============================================================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# OpenSSL is required by Prisma Client generator and query engine on Debian slim
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first to leverage Docker layer caching
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

# Install all workspace dependencies cleanly from package-lock.json
RUN npm ci

# Copy Prisma schema and generate the typed Prisma Client
COPY server/prisma ./server/prisma
RUN npm run prisma:generate

# Copy application source for server and client workspaces
COPY server/tsconfig.json ./server/tsconfig.json
COPY server/src ./server/src
COPY client/tsconfig.json client/vite.config.ts client/postcss.config.js client/tailwind.config.js client/index.html ./client/
COPY client/src ./client/src

# Compile server TypeScript (server/dist) and bundle client SPA (client/dist)
RUN npm run build

# ==============================================================================
# Stage 2: prod-deps — Install only production runtime dependencies for server
# ==============================================================================
FROM node:20-bookworm-slim AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm ci --omit=dev --workspace=server --include-workspace-root=false

# Copy generated Prisma Client artifacts from the builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# ==============================================================================
# Stage 3: runtime — Lean production image serving both API and built React SPA
# ==============================================================================
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# OpenSSL and CA certificates are required at runtime by Prisma's query engine
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG COMMIT_SHA=""
ENV NODE_ENV=production
ENV PORT=3000
ENV COMMIT_SHA=${COMMIT_SHA}

# Copy production manifests and pruned node_modules (including generated Prisma Client)
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node server/package.json ./server/package.json
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/server/node_modules ./server/node_modules

# Copy Prisma schema/migrations and built server + client artifacts
# Layout matches server/src/staticClient.ts: server/dist -> ../../client/dist
COPY --from=builder --chown=node:node /app/server/prisma ./server/prisma
COPY --from=builder --chown=node:node /app/server/dist ./server/dist
COPY --from=builder --chown=node:node /app/client/dist ./client/dist

USER node

EXPOSE 3000

CMD ["node", "server/dist/server.js"]
