# One image, three entrypoints (collector | processor | web) — HERMES_ROLE picks.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- deps: install the whole workspace (cached on lockfile) ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/collector/package.json packages/collector/
COPY packages/processor/package.json packages/processor/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile=false

# --- build: bring in sources and build the web app ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter @hermes/web build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache wget
COPY --from=build /app ./
RUN chmod +x scripts/entrypoint.sh
# Health ports (collector 8081, processor 8082) and web (3000) are published by compose.
ENTRYPOINT ["scripts/entrypoint.sh"]
