# syntax=docker/dockerfile:1

# ── deps: install the workspace once, with the lockfile ──────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @iphoneha/api... --filter @iphoneha/shared...

# ── build: shared package → Prisma client → Nest build ───────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @iphoneha/shared build \
 && pnpm --filter @iphoneha/api prisma:generate \
 && pnpm --filter @iphoneha/api build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini && corepack enable
ENV NODE_ENV=production PORT=4000
WORKDIR /repo
# the pnpm store links dependencies across the workspace, so the whole tree
# travels together (node_modules included) rather than being re-resolved here
COPY --from=build /repo ./
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
# migrations run on boot so a fresh container always matches the schema
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
