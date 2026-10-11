#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# iphoneha.com — admin login code on the server, for when the SMS does not come
# (Melipayamak pattern not approved yet, the SMS service unreachable…).
#
#   1. on https://iphoneha.com/admin/login enter your mobile and press «ارسال کد»
#   2. as root:   bash /home/iphoneha/app/deploy/admin-code.sh 09121234567
#   3. type the code it prints where the SMS code goes (valid 10 minutes, once)
#
# Only an active admin's number gets a code. It prints in this terminal only.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR=/home/iphoneha/app
[ "$(id -u)" = "0" ] || { echo "run this as root" >&2; exit 1; }
[ -f "$APP_DIR/.env" ] || { echo "$APP_DIR/.env is missing — the store is not installed" >&2; exit 1; }

PHONE=${1:-}
[ -n "$PHONE" ] || read -r -p "admin mobile (09…): " PHONE

su -s /bin/bash -l iphoneha -c "cd $APP_DIR/apps/api && set -a && . $APP_DIR/.env && set +a && \
  ADMIN_CODE_PHONE=$(printf %q "$PHONE") ./node_modules/.bin/tsx prisma/admin-code.ts"
