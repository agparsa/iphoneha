#!/usr/bin/env bash
# Build and (re)start iphoneha.com. Runs as the unprivileged `iphoneha` user:
#   cd /home/iphoneha/app && ./deploy/deploy.sh
#
# It does NOT talk to Docker — a cPanel user has no access to the Docker
# socket. The postgres/redis containers are started by root, either through
# deploy/bootstrap-root.sh or with:
#   docker compose -f deploy/docker-compose.data.yml --env-file .env up -d
#
# On this CloudLinux server run it through deploy/bootstrap-root.sh (as root)
# instead of `su`: an `su` session lands in the account's LVE (1 GB RAM), which
# is too small for `next build`; bootstrap runs it in its own systemd unit.
#
# Order matters: the storefront prerenders its pages from the API at build
# time (and fails if the API does not answer), so the API is built, migrated,
# seeded and started first, and the storefront is built against it.
#
# Safe to re-run: it rebuilds from scratch, applies pending migrations and only
# seeds when the catalogue is still empty.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m   ! %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

[ -f .env ] || die ".env is missing — copy deploy/env.production.example to .env first"
grep -q 'CHANGE_ME' .env && die ".env still contains CHANGE_ME placeholders"

set -a; . ./.env; set +a
export NEXT_TELEMETRY_DISABLED=1

LOG_DIR="$HOME/logs"
mkdir -p "$LOG_DIR"
API_PORT="${API_PORT:-4000}"
API_HEALTH="http://127.0.0.1:$API_PORT/api/health"

# ── pnpm ─────────────────────────────────────────────────────────────────────
# `corepack enable` alone writes into Node's install directory, which a cPanel
# user cannot touch — so the shims go into the home directory instead.
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
export PATH="$HOME/.local/bin:$PNPM_HOME:$PATH"
if ! command -v pnpm >/dev/null 2>&1; then
  step "0/7  installing pnpm (into \$HOME, no root needed)"
  mkdir -p "$HOME/.local/bin"
  corepack enable --install-directory "$HOME/.local/bin" pnpm 2>/dev/null \
    || npm install -g --prefix "$HOME/.local" pnpm@10.28.0
  command -v pnpm >/dev/null 2>&1 \
    || die "could not install pnpm — try: npm install -g --prefix \$HOME/.local pnpm@10.28.0"
fi
echo "pnpm $(pnpm --version) · node $(node --version)"

# ── helpers ──────────────────────────────────────────────────────────────────
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

api_healthy() {
  node -e "fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" "$API_HEALTH" 2>/dev/null
}

wait_api() {
  for _ in $(seq 1 45); do
    api_healthy && return 0
    # a temporary API that already exited will not come back — fail fast
    if [ -n "$TMP_API_PID" ] && ! kill -0 "$TMP_API_PID" 2>/dev/null; then
      return 1
    fi
    sleep 2
  done
  return 1
}

api_logs() {
  for f in "$LOG_DIR/api-build.log" "$LOG_DIR/api.error.log" "$LOG_DIR/api.log"; do
    [ -s "$f" ] && { echo "--- tail $f"; tail -n 25 "$f"; }
  done
  return 0
}

# A throwaway API process, used only when the systemd service cannot be
# restarted from here (first run before the services exist, or no sudo).
TMP_API_PID=""
stop_tmp_api() {
  [ -n "$TMP_API_PID" ] || return 0
  kill "$TMP_API_PID" 2>/dev/null || true
  for _ in $(seq 1 15); do
    kill -0 "$TMP_API_PID" 2>/dev/null || break
    sleep 1
  done
  kill -9 "$TMP_API_PID" 2>/dev/null || true
  wait "$TMP_API_PID" 2>/dev/null || true
  TMP_API_PID=""
}
trap stop_tmp_api EXIT

# ── data services ────────────────────────────────────────────────────────────
step "1/8  waiting for postgres and redis"
wait_port() {
  for _ in $(seq 1 45); do
    port_open "$1" && return 0
    sleep 2
  done
  return 1
}
wait_port 55432 || die "nothing is listening on 127.0.0.1:55432 — as root run:
    cd $APP_DIR && docker compose -f deploy/docker-compose.data.yml --env-file .env up -d"
wait_port 56379 || die "nothing is listening on 127.0.0.1:56379 (redis)"
# an open port is not proof: make each one answer a real request
if command -v psql >/dev/null 2>&1; then
  PGPASSWORD="${POSTGRES_PASSWORD:-}" PGCONNECT_TIMEOUT=5 \
    psql -h 127.0.0.1 -p 55432 -U "${POSTGRES_USER:-iphoneha}" -d "${POSTGRES_DB:-iphoneha}" -tAc 'select 1' >/dev/null \
    || die "postgres accepts connections on 127.0.0.1:55432 but does not answer queries (see the error above)"
fi
( exec 3<>/dev/tcp/127.0.0.1/56379 && printf 'AUTH %s\r\nPING\r\n' "${REDIS_PASSWORD:-}" >&3 \
    && IFS= read -r -t 3 auth <&3 && [[ $auth == +OK* ]] && IFS= read -r -t 3 reply <&3 && [[ $reply == +PONG* ]] ) 2>/dev/null \
  || die "redis accepts connections on 127.0.0.1:56379 but does not answer an authenticated PING (REDIS_PASSWORD in .env must be the one the container was started with — as root: cd $APP_DIR && docker compose -f deploy/docker-compose.data.yml --env-file .env up -d)"
echo "   both answering"

step "2/8  dependencies"
# the app folder is an extracted archive, not a git clone: the pre-commit hook has nowhere to go
SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 pnpm install --frozen-lockfile --prod=false

step "3/8  prisma client"
pnpm --filter @iphoneha/api run prisma:generate

step "4/8  build: shared package + API"
pnpm --filter @iphoneha/shared build
pnpm --filter @iphoneha/api build

step "5/8  database migrations"
pnpm --filter @iphoneha/api run prisma:migrate

step "6/8  catalogue: seed an empty database, then sync models, colours, product photos and articles"
COUNT=""
if command -v psql >/dev/null 2>&1; then
  COUNT=$(PGPASSWORD="${POSTGRES_PASSWORD:-}" PGCONNECT_TIMEOUT=5 psql -h 127.0.0.1 -p 55432 -U "${POSTGRES_USER:-iphoneha}" \
    -d "${POSTGRES_DB:-iphoneha}" -tAc 'SELECT count(*) FROM "Product"' 2>/dev/null | tr -d '[:space:]' || true)
fi
if [ -z "$COUNT" ]; then
  # no psql on this machine: ask Prisma itself
  COUNT=$(cd apps/api && node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.product.count().then((c)=>{console.log(c);return p.\$disconnect()},()=>process.exit(1))" 2>/dev/null | tail -1 | tr -d '[:space:]' || true)
fi
if [ -z "$COUNT" ]; then
  # never seed blindly into a live catalogue: only a confirmed empty one gets the seed
  warn "could not read the product count — seed skipped (run it by hand on an empty database only)"
elif [ "$COUNT" = "0" ]; then
  pnpm --filter @iphoneha/api run prisma:seed
else
  echo "   catalogue already has $COUNT products — skipping seed"
fi
# new models and colour × capacity combinations arrive unpriced (hidden until the
# owner prices them); prices, stock, texts and the owner's own photos are never touched
if ! pnpm --filter @iphoneha/api run catalog:sync; then
  warn "the catalogue sync failed — the site keeps its current catalogue (the output above says why)"
fi
# magazine articles shipped with this release are added once; edited or deleted ones are left alone
if ! pnpm --filter @iphoneha/api run content:sync; then
  warn "the magazine sync failed — the site keeps its current articles (the output above says why)"
fi

step "7/8  start the new API, then build the storefront against it"
API_VIA_SYSTEMD=0
if sudo -n systemctl restart iphoneha-api >/dev/null 2>&1; then
  API_VIA_SYSTEMD=1
  echo "   iphoneha-api restarted with the new build"
elif port_open "$API_PORT"; then
  warn "could not restart iphoneha-api from here — building against the API that is already running"
else
  echo "   the service is not running yet — starting a temporary API just for this build"
  (cd apps/api && exec node dist/main.js) >>"$LOG_DIR/api-build.log" 2>&1 &
  TMP_API_PID=$!
fi
wait_api || { api_logs; die "the API did not become healthy — the log lines above say why"; }
echo "   API healthy — building the storefront"
pnpm --filter @iphoneha/web build
stop_tmp_api

step "8/8  restart the storefront"
if [ "$API_VIA_SYSTEMD" = 1 ] && sudo -n systemctl restart iphoneha-web >/dev/null 2>&1; then
  wait_api || warn "the API stopped answering after the storefront restart"
  for _ in $(seq 1 20); do
    port_open 3000 && break
    sleep 1
  done
  echo "   api:        $(node -e "fetch(process.argv[1]).then(r=>r.text()).then(t=>console.log(t),()=>console.log('no answer'))" "$API_HEALTH")"
  echo "   storefront: $(port_open 3000 && echo 'listening on 127.0.0.1:3000' || echo 'not answering yet')"
else
  echo "   the services could not be restarted from this account — as root run:"
  echo "     systemctl restart iphoneha-api iphoneha-web"
  echo "   (on the first install bootstrap-root.sh does this for you)"
fi

date -u +%FT%TZ > "$APP_DIR/.deploy-ok"   # bootstrap-root.sh checks for this
printf '\n\033[1;32m✓ build finished\033[0m\n'
