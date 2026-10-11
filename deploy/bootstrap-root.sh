#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# iphoneha.com — one-shot deployment.
#
# Run ONCE as root, after uploading iphoneha-deploy.tar.gz to /home/iphoneha/:
#
#     bash /tmp/bootstrap-root.sh
#
# It unpacks the source, writes a .env with secrets generated on this machine,
# starts postgres and redis as containers, builds as the unprivileged
# `iphoneha` user, installs the two systemd services and the reverse-proxy
# includes, then starts everything and checks that it answers.
#
# Scope: only iphoneha.com. No system packages are installed, no global config
# is changed, and every step that could affect the other sites on this server
# (the Apache and nginx includes) is rolled back on its own if it fails
# validation. `deploy/README.md` has a section that undoes all of it.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

USER_NAME=iphoneha
HOME_DIR=/home/$USER_NAME
APP_DIR=$HOME_DIR/app
DOMAIN=iphoneha.com
TARBALL=${1:-$HOME_DIR/iphoneha-deploy.tar.gz}
COMPOSE="docker compose -f $APP_DIR/deploy/docker-compose.data.yml --env-file $APP_DIR/.env"

bold() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$1"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }
# print the end of a log so a failure can be diagnosed from this screen alone
show_log() { [ -s "$1" ] && { echo "--- tail $1"; tail -n 30 "$1"; }; return 0; }
answers() { curl -fsS -o /dev/null --max-time 10 "$1" 2>/dev/null; }

# Real protocol checks over the exact path the app uses (127.0.0.1 on the
# host). A bare TCP connect is not enough: a published Docker port can accept
# the connection and still never answer when a firewall sits in between.
db_query() {
  ( set -a; . "$APP_DIR/.env"; set +a
    PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT=5 \
      psql -h 127.0.0.1 -p 55432 -U "${POSTGRES_USER:-iphoneha}" -d "${POSTGRES_DB:-iphoneha}" -tAc "$1" )
}
redis_ping() {  # signs in with the password from .env, then PINGs — a real Redis answer, not just an open port
  ( set -a; . "$APP_DIR/.env"; set +a
    exec 3<>/dev/tcp/127.0.0.1/56379 && printf 'AUTH %s\r\nPING\r\n' "$REDIS_PASSWORD" >&3 \
      && IFS= read -r -t 3 auth <&3 && [[ $auth == +OK* ]] \
      && IFS= read -r -t 3 reply <&3 && [[ $reply == +PONG* ]] ) 2>/dev/null
}

[ "$(id -u)" = "0" ] || die "run this as root"
id "$USER_NAME" >/dev/null 2>&1 || die "user $USER_NAME does not exist"
command -v docker >/dev/null || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose plugin is missing"

# ── 1. source ───────────────────────────────────────────────────────────────
bold "1/8  unpacking the source"
if [ -f "$TARBALL" ]; then
  TMP=$(mktemp -d)
  tar xzf "$TARBALL" -C "$TMP"
  SRC=$(dirname "$(find "$TMP" -maxdepth 2 -name pnpm-workspace.yaml | head -1)")
  [ -d "$SRC" ] || die "could not find the project root inside $TARBALL"
  install -d -o $USER_NAME -g $USER_NAME "$APP_DIR"
  # .env and uploaded product images are never overwritten by an update.
  # The patterns are anchored to the project root: a bare `storage` would also
  # match apps/api/src/modules/storage and silently drop that source folder.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude /.env --exclude /storage --exclude /apps/api/storage "$SRC/" "$APP_DIR/"
  else
    rm -rf "$SRC/.env" "$SRC/storage" "$SRC/apps/api/storage"
    cp -a "$SRC/." "$APP_DIR/"
  fi
  [ -f "$APP_DIR/apps/api/src/modules/storage/storage.module.ts" ] \
    || die "the source copy is incomplete (apps/api/src/modules/storage is missing)"
  rm -rf "$TMP"
  ok "source at $APP_DIR"
else
  [ -f "$APP_DIR/package.json" ] || die "no tarball at $TARBALL and no source at $APP_DIR"
  warn "tarball not found — using the source already in $APP_DIR"
fi
chown -R $USER_NAME:$USER_NAME "$APP_DIR"
install -d -o $USER_NAME -g $USER_NAME "$HOME_DIR/logs" "$APP_DIR/storage"

# ── 2. configuration ────────────────────────────────────────────────────────
bold "2/8  configuration"
if [ -f "$APP_DIR/.env" ] && ! grep -q CHANGE_ME "$APP_DIR/.env"; then
  ok ".env already configured — leaving it alone"
else
  DB_PASS=$(openssl rand -hex 24)
  sed -e "s/CHANGE_ME_db_password/$DB_PASS/g" \
      -e "s/CHANGE_ME_redis_password/$(openssl rand -hex 24)/g" \
      -e "s/CHANGE_ME_otp_secret_at_least_32_chars/$(openssl rand -hex 32)/" \
      -e "s/CHANGE_ME_revalidate_secret/$(openssl rand -hex 32)/" \
      "$APP_DIR/deploy/env.production.example" > "$APP_DIR/.env"
  chown $USER_NAME:$USER_NAME "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  grep -q CHANGE_ME "$APP_DIR/.env" && die "some CHANGE_ME values were not replaced — edit .env by hand"
  ok ".env written with generated secrets (chmod 600, never printed)"
fi
# Installs from before the Redis password: give this one a password too. The
# container picks it up when compose recreates it below (its data volume stays).
if ! grep -q '^REDIS_PASSWORD=' "$APP_DIR/.env"; then
  REDIS_PASS=$(openssl rand -hex 24)
  REDIS_OLD=$(grep -E '^REDIS_URL=' "$APP_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d "'\"")
  REDIS_HOSTPART=${REDIS_OLD#redis://}; REDIS_HOSTPART=${REDIS_HOSTPART#*@}
  [ -n "$REDIS_HOSTPART" ] || REDIS_HOSTPART=127.0.0.1:56379/0
  TMP_ENV=$(mktemp)
  grep -vE '^REDIS_URL=' "$APP_DIR/.env" > "$TMP_ENV"
  printf 'REDIS_PASSWORD=%s\nREDIS_URL=redis://:%s@%s\n' "$REDIS_PASS" "$REDIS_PASS" "$REDIS_HOSTPART" >> "$TMP_ENV"
  cat "$TMP_ENV" > "$APP_DIR/.env"; rm -f "$TMP_ENV"
  chown $USER_NAME:$USER_NAME "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"
  ok "redis now needs a password (generated into .env — the other sites on this box could reach it without one)"
fi

# ── 3. postgres + redis ─────────────────────────────────────────────────────
# Started as root: the cPanel user has no access to the Docker socket.
bold "3/8  postgres + redis (containers, loopback only)"
$COMPOSE up -d
for _ in $(seq 1 45); do
  docker exec iphoneha-postgres pg_isready -q -h 127.0.0.1 -p 55432 -U $USER_NAME 2>/dev/null && break
  sleep 2
done
docker exec iphoneha-postgres pg_isready -q -h 127.0.0.1 -p 55432 -U $USER_NAME 2>/dev/null \
  || { docker logs --tail 20 iphoneha-postgres 2>&1; die "postgres did not become ready — its log is above"; }
for _ in $(seq 1 15); do redis_ping && break; sleep 2; done
redis_ping || { docker logs --tail 20 iphoneha-redis 2>&1; die "redis does not answer on 127.0.0.1:56379 — its log is above"; }
if command -v psql >/dev/null 2>&1; then
  for _ in $(seq 1 15); do [ "$(db_query 'select 1' 2>/dev/null)" = 1 ] && break; sleep 2; done
  if [ "$(db_query 'select 1' 2>/dev/null)" != 1 ]; then
    db_query 'select 1' 2>&1 | tail -3
    die "postgres is running but does not answer queries on 127.0.0.1:55432"
  fi
fi
ok "postgres and redis answer real queries on 127.0.0.1:55432 and :56379"

# ── 4. services (installed now, started after the build) ────────────────────
bold "4/8  installing the services"
# the unit files ship with /bin/node; point them at whatever node this server
# actually has, so a cPanel update that moves the binary cannot break the site
NODE_BIN=$(command -v node || true)
[ -x "${NODE_BIN:-}" ] || NODE_BIN=/bin/node
[ -x "$NODE_BIN" ] || die "node was not found on this server"
"$NODE_BIN" --version | grep -qE '^v(2[2-9]|[3-9][0-9])' || warn "node $($NODE_BIN --version) is older than v22 — the build may fail"
for UNIT in iphoneha-api iphoneha-web; do
  sed "s|^ExecStart=/bin/node|ExecStart=$NODE_BIN|" \
    "$APP_DIR/deploy/systemd/$UNIT.service" > "/etc/systemd/system/$UNIT.service"
  chmod 644 "/etc/systemd/system/$UNIT.service"
done
ok "services will run with $NODE_BIN ($($NODE_BIN --version))"
cat > /etc/sudoers.d/iphoneha-app <<SUDO
$USER_NAME ALL=(root) NOPASSWD: /usr/bin/systemctl restart iphoneha-api, /usr/bin/systemctl restart iphoneha-web, /usr/bin/systemctl restart iphoneha-api iphoneha-web, /usr/bin/systemctl status iphoneha-api, /usr/bin/systemctl status iphoneha-web
SUDO
chmod 440 /etc/sudoers.d/iphoneha-app
visudo -cf /etc/sudoers.d/iphoneha-app >/dev/null 2>&1 \
  || { rm -f /etc/sudoers.d/iphoneha-app; warn "sudoers rule rejected — skipped (harmless)"; }
systemctl daemon-reload
systemctl enable iphoneha-api iphoneha-web >/dev/null 2>&1
ok "iphoneha-api and iphoneha-web installed"

# ── 5. build ────────────────────────────────────────────────────────────────
# The build runs entirely as the unprivileged user, but in a transient systemd
# unit rather than through `su`: on CloudLinux, `su` puts it inside the
# account's LVE (1 GB RAM and 1 MB/s disk on this server), where `next build`
# — about 1.8 GB at its peak — is OOM-killed. The unit gets its own ceiling
# instead, sized so the other sites keep memory and CPU while it runs.
bold "5/8  build (5–10 minutes on 2 cores — this is the slow part)"
rm -f "$APP_DIR/.deploy-ok"
if command -v systemd-run >/dev/null 2>&1; then
  systemd-run --quiet --wait --pipe --collect \
    --unit="iphoneha-build-$(date +%s)" \
    --uid="$USER_NAME" --gid="$USER_NAME" \
    --working-directory="$APP_DIR" \
    -p MemoryHigh=2G -p MemoryMax=2560M -p MemorySwapMax=0 \
    -p CPUQuota=150% -p IOWeight=50 \
    -E HOME="$HOME_DIR" -E USER="$USER_NAME" -E LOGNAME="$USER_NAME" \
    /bin/bash -lc "cd $APP_DIR && ./deploy/deploy.sh" </dev/null \
    || die "the build failed — send me the output above"
else
  # -s /bin/bash bypasses the account's cPanel jailshell
  su -s /bin/bash -l $USER_NAME -c "cd $APP_DIR && ./deploy/deploy.sh" \
    || die "the build failed — send me the output above"
fi
[ -f "$APP_DIR/.deploy-ok" ] || die "the build did not finish — send me the output above"

# ── 6. start ────────────────────────────────────────────────────────────────
bold "6/8  starting the site"
systemctl restart iphoneha-api iphoneha-web
for _ in $(seq 1 30); do answers http://127.0.0.1:4000/api/health && break; sleep 2; done
if ! answers http://127.0.0.1:4000/api/health; then
  systemctl status iphoneha-api --no-pager -n 0 2>/dev/null | head -5
  show_log "$HOME_DIR/logs/api.error.log"; show_log "$HOME_DIR/logs/api.log"
  die "the API did not come up — the log lines above say why"
fi
for _ in $(seq 1 30); do answers http://127.0.0.1:3000/ && break; sleep 2; done
if ! answers http://127.0.0.1:3000/; then
  systemctl status iphoneha-web --no-pager -n 0 2>/dev/null | head -5
  show_log "$HOME_DIR/logs/web.error.log"; show_log "$HOME_DIR/logs/web.log"
  die "the storefront did not come up — the log lines above say why"
fi
ok "API and storefront are answering on the loopback"

# ── 7. reverse proxy ────────────────────────────────────────────────────────
bold "7/8  Apache reverse proxy for $DOMAIN"
APACHE_SKIPPED=0
APACHE_MODS=$(apachectl -M 2>/dev/null || httpd -M 2>/dev/null || true)
if [ -n "$APACHE_MODS" ] && ! grep -q proxy_http_module <<<"$APACHE_MODS"; then
  # without it the include would pass configtest and then answer every page with 500
  APACHE_SKIPPED=1
  warn "Apache has no mod_proxy_http, so it cannot hand the pages to Next.js."
  warn "Skipped the Apache include; nothing was changed in Apache."
else
  for MODE in std ssl; do
    D=/etc/apache2/conf.d/userdata/$MODE/2_4/$USER_NAME/$DOMAIN
    install -d "$D"
    install -m 644 "$APP_DIR/deploy/apache/proxy.conf" "$D/"
  done
  /scripts/ensure_vhost_includes --user=$USER_NAME >/dev/null 2>&1 || warn "ensure_vhost_includes reported a problem"
  if apachectl configtest 2>&1 | grep -qi "syntax ok"; then
    systemctl reload httpd 2>/dev/null || systemctl restart httpd
    ok "Apache reloaded"
  else
    rm -rf /etc/apache2/conf.d/userdata/std/2_4/$USER_NAME/$DOMAIN \
           /etc/apache2/conf.d/userdata/ssl/2_4/$USER_NAME/$DOMAIN
    /scripts/ensure_vhost_includes --user=$USER_NAME >/dev/null 2>&1 || true
    die "Apache rejected the include — it was removed again and nothing is broken.
     Send me the output of:  apachectl configtest"
  fi
fi

bold "8/8  nginx include for $DOMAIN"
NGINX_DIR=/etc/nginx/conf.d/users/$USER_NAME/$DOMAIN
install -d "$NGINX_DIR"
install -m 644 "$APP_DIR/deploy/nginx/iphoneha-proxy.conf" "$NGINX_DIR/"
if NGINX_TEST=$(nginx -t 2>&1); then
  systemctl reload nginx
  ok "nginx reloaded — the API, SSE stream and static assets now skip Apache"
else
  rm -f "$NGINX_DIR/iphoneha-proxy.conf"
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  warn "nginx refused the include and it was removed — the site still works through Apache"
  echo "$NGINX_TEST" | grep -iE "emerg|error|fail" | head -5 | sed 's/^/    /'
fi

# ── maintenance ─────────────────────────────────────────────────────────────
bold "maintenance: log rotation and nightly backup"
cat > /etc/logrotate.d/iphoneha <<LOGROTATE
$HOME_DIR/logs/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    su $USER_NAME $USER_NAME
}
LOGROTATE
chmod 644 /etc/logrotate.d/iphoneha
if logrotate -d /etc/logrotate.d/iphoneha >/dev/null 2>&1; then
  ok "logs rotate daily, 14 days kept"
else
  rm -f /etc/logrotate.d/iphoneha
  warn "logrotate rejected the config — skipped"
fi
chmod 755 "$APP_DIR/deploy/backup.sh"
ln -sfn "$APP_DIR/deploy/backup.sh" /etc/cron.daily/iphoneha-backup
ok "nightly backup of the database, images and .env → $HOME_DIR/backups (14 days kept)"

# ── checks ──────────────────────────────────────────────────────────────────
# informational only: a failed probe here must not hide the summary below
set +e +o pipefail
bold "checks"
echo "--- API health:"
curl -fsS http://127.0.0.1:4000/api/health; echo
echo "--- storefront through the web server, as the domain sees it:"
curl -sI -H "Host: $DOMAIN" http://127.0.0.1/ | head -1
echo "--- robots.txt:"
curl -s -H "Host: $DOMAIN" http://127.0.0.1/robots.txt | head -3
echo "--- sitemap:"
curl -s -H "Host: $DOMAIN" http://127.0.0.1/sitemap.xml | grep -c "<url>" | sed 's/^/    urls: /'
echo "--- dns (must point here before a certificate can be issued):"
dig +short $DOMAIN @1.1.1.1 A 2>/dev/null || echo "    (dig unavailable)"

printf '\n\033[1;32m✓ deployment finished\033[0m\n'
# what the store runs on now: before go-live SMS is the console, after it Melipayamak
SMS_NOW=$(sed -n "s/^SMS_DRIVER=['\"]\{0,1\}\([a-z]*\).*/\1/p" "$APP_DIR/.env" | tail -1)
cat <<NEXT

next:
  1. DNS:   A  @  -> 2.25.204.68      A  www -> 2.25.204.68
  2. once it resolves, issue the certificate:
       /usr/local/cpanel/bin/autossl_check --user=$USER_NAME
NEXT
if [ "${SMS_NOW:-console}" = console ]; then
  cat <<NEXT
  3. switch to real customers (asks for your mobile, Melipayamak and Zarinpal):
       bash $APP_DIR/deploy/go-live.sh

until then no login code is sent by SMS; an admin's code is printed in the API log:
  tail -n 40 $HOME_DIR/logs/api.log
NEXT
else
  cat <<NEXT
  3. the store is already switched to real customers; run go-live.sh again only to change a key

admin sign-in is by SMS; if the code does not arrive:
  bash $APP_DIR/deploy/admin-code.sh <your mobile>
NEXT
fi
if [ "$APACHE_SKIPPED" = 1 ]; then
  printf '\n\033[1;33m! pages are not served yet: install mod_proxy_http in WHM → EasyApache 4 →\n  Customize → Apache Modules, then run this script again.\033[0m\n'
fi
