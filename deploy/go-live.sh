#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# iphoneha.com — switch the installed store to real customers.
#
# Run ONCE as root, after bootstrap-root.sh has finished:
#
#     bash /home/iphoneha/app/deploy/go-live.sh
#
# It asks for the owner's mobile, the public phone, the Melipayamak account and
# the Zarinpal merchant id — typed here, on the server, never sent anywhere
# else — then:
#   1. writes them into /home/iphoneha/app/.env (a backup of the old one is kept)
#   2. makes the owner the only admin and disables the sample staff accounts
#   3. removes the sample ratings and coupon and marks every sample variant
#      out of stock, once, so nothing fake can be bought or read as genuine
#   4. restarts the site and proves both keys work: a real login code is sent
#      to the owner's phone and Zarinpal is asked to open a (never paid) payment
#
# Safe to re-run later to change a key: the sample-data cleanup never repeats.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

USER_NAME=iphoneha
HOME_DIR=/home/$USER_NAME
APP_DIR=$HOME_DIR/app
ENV_FILE=$APP_DIR/.env

bold() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$1"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || die "run this as root"
[ -f "$ENV_FILE" ] || die "$ENV_FILE is missing — run bootstrap-root.sh first"
[ -f "$APP_DIR/apps/api/dist/main.js" ] || die "the API is not built — run bootstrap-root.sh first"

# Persian/Arabic digits → ASCII, spaces and dashes removed. Plain bash substitution:
# `tr` works on bytes and would mangle the multibyte digits.
digits() {
  local s=$1 i
  local fa=(۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹) ar=(٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩)
  for i in 0 1 2 3 4 5 6 7 8 9; do s=${s//${fa[$i]}/$i}; s=${s//${ar[$i]}/$i}; done
  s=${s// /}; s=${s//-/}
  printf '%s' "$s"
}

ask() {  # ask VAR "question" [default]
  local answer
  if [ -n "${3:-}" ]; then read -r -p "  $2 [$3]: " answer; answer=${answer:-$3}; else read -r -p "  $2: " answer; fi
  printf -v "$1" '%s' "$answer"
}

ask_secret() {  # ask_secret VAR "question"
  local answer
  read -r -s -p "  $2: " answer; echo
  printf -v "$1" '%s' "$answer"
}

# ── 1. questions ────────────────────────────────────────────────────────────
bold "1/5  store owner"
while :; do
  ask ADMIN_PHONE "your mobile for the admin panel (09…)"
  ADMIN_PHONE=$(digits "$ADMIN_PHONE")
  [[ $ADMIN_PHONE =~ ^09[0-9]{9}$ ]] && break
  warn "not a mobile number like 09121234567 — try again"
done
ask ADMIN_NAME "your name, as shown in the panel" "مدیر فروشگاه"
ask STORE_PHONE "public phone printed on the site" "$ADMIN_PHONE"

bold "2/5  Melipayamak (shared service line + approved patterns)"
ask MP_USER "web-service username"
[[ $MP_USER =~ ^[A-Za-z0-9._@-]+$ ]] || die "the username has unexpected characters"
while :; do
  ask_secret MP_PASS "web-service password (hidden)"
  [ -n "$MP_PASS" ] || { warn "empty password"; continue; }
  [[ $MP_PASS == *"'"* || $MP_PASS == *$'\n'* ]] && { warn "the password contains ' — set a web-service password without it"; continue; }
  break
done
while :; do
  ask MP_OTP "bodyId of the approved LOGIN pattern (کد ورود شما: {0})"
  MP_OTP=$(digits "$MP_OTP"); [[ $MP_OTP =~ ^[0-9]+$ ]] && break
  warn "the bodyId is a number"
done
ask MP_PAID "bodyId of the PAYMENT pattern (optional, Enter to skip)" ""
MP_PAID=$(digits "$MP_PAID"); [[ -z $MP_PAID || $MP_PAID =~ ^[0-9]+$ ]] || die "the bodyId is a number"
ask MP_SHIPPED "bodyId of the SHIPPED pattern (optional, Enter to skip)" ""
MP_SHIPPED=$(digits "$MP_SHIPPED"); [[ -z $MP_SHIPPED || $MP_SHIPPED =~ ^[0-9]+$ ]] || die "the bodyId is a number"

bold "3/5  Zarinpal"
while :; do
  ask ZP_MERCHANT "merchant id (36 characters, xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)"
  ZP_MERCHANT=$(printf '%s' "$ZP_MERCHANT" | tr -d ' ')
  [[ $ZP_MERCHANT =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] && break
  warn "that is not a Zarinpal merchant id — copy it again from the Zarinpal panel"
done

echo
echo "  owner:        $ADMIN_PHONE ($ADMIN_NAME)"
echo "  site phone:   $STORE_PHONE"
echo "  melipayamak:  $MP_USER / password ${#MP_PASS} chars / login pattern $MP_OTP / payment ${MP_PAID:-–} / shipped ${MP_SHIPPED:--}"
echo "  zarinpal:     ${ZP_MERCHANT:0:8}…${ZP_MERCHANT: -4} (live gateway, not sandbox)"
echo "  sample data:  ratings and coupon WELCOME5 removed, sample stock set to 0 (only the first time)"
read -r -p "  go live with these? [y/N]: " CONFIRM
[[ $CONFIRM =~ ^[Yy]$ ]] || die "nothing was changed"

# ── 2. .env ─────────────────────────────────────────────────────────────────
bold "4/5  writing the keys"
BACKUP="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
install -m 600 -o $USER_NAME -g $USER_NAME "$ENV_FILE" "$BACKUP"

set_env() {  # set_env KEY VALUE — replaces the line or appends it; single-quoted, never expanded
  local key=$1 value="'$2'" tmp
  tmp=$(mktemp)
  if grep -q "^$key=" "$ENV_FILE"; then
    # through ENVIRON, not awk -v: -v would interpret backslashes in a password
    K="$key" V="$value" awk 'index($0, ENVIRON["K"] "=") == 1 { print ENVIRON["K"] "=" ENVIRON["V"]; next } { print }' \
      "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"; printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
unset_env() { sed -i "/^$1=/d" "$ENV_FILE"; }

set_env SMS_DRIVER melipayamak
set_env MELIPAYAMAK_USERNAME "$MP_USER"
set_env MELIPAYAMAK_PASSWORD "$MP_PASS"
set_env MELIPAYAMAK_OTP_BODY_ID "$MP_OTP"
if [ -n "$MP_PAID" ]; then set_env MELIPAYAMAK_ORDER_PAID_BODY_ID "$MP_PAID"; else unset_env MELIPAYAMAK_ORDER_PAID_BODY_ID; fi
if [ -n "$MP_SHIPPED" ]; then set_env MELIPAYAMAK_ORDER_SHIPPED_BODY_ID "$MP_SHIPPED"; else unset_env MELIPAYAMAK_ORDER_SHIPPED_BODY_ID; fi
set_env PAYMENT_ONLINE_DRIVER zarinpal
set_env ZARINPAL_MERCHANT_ID "$ZP_MERCHANT"
set_env ZARINPAL_SANDBOX false
unset_env ALLOW_MOCK_PAYMENTS
set_env DEV_EXPOSE_OTP false
set_env SEED_ADMIN_PHONE "$ADMIN_PHONE"
chown $USER_NAME:$USER_NAME "$ENV_FILE"; chmod 600 "$ENV_FILE"
ok ".env updated (previous version kept as $(basename "$BACKUP"))"

# the address this server leaves from (local lookup — nothing is sent anywhere)
SERVER_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)
[ -n "$SERVER_IP" ] || SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)

abroad_hint() {  # abroad_hint SERVICE — when an Iranian service does not answer at all
  warn "Iranian services often refuse or drop connections from servers outside Iran;"
  warn "this server's address is $SERVER_IP. See «Iranian services from a server abroad» in"
  warn "$APP_DIR/deploy/README.md for the ways around it."
}

as_app() {  # runs a command as the app user in apps/api, with .env loaded
  su -s /bin/bash -l $USER_NAME -c "cd $APP_DIR/apps/api && set -a && . $ENV_FILE && set +a && $1"
}

as_app "GO_LIVE_ADMIN_PHONE=$(printf %q "$ADMIN_PHONE") GO_LIVE_ADMIN_NAME=$(printf %q "$ADMIN_NAME") GO_LIVE_STORE_PHONE=$(printf %q "$STORE_PHONE") ./node_modules/.bin/tsx prisma/go-live.ts" \
  || die "switching the data failed — the output above says why (the .env backup is $BACKUP)"

# ── 3. restart and prove it works ───────────────────────────────────────────
bold "5/5  restarting and testing the real keys"
systemctl restart iphoneha-api iphoneha-web
for _ in $(seq 1 30); do curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/api/health 2>/dev/null && break; sleep 2; done
if ! curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/api/health; then
  tail -n 20 $HOME_DIR/logs/api.error.log 2>/dev/null || true
  die "the API did not start with the new keys — the log above says why (restore with: cp $BACKUP $ENV_FILE)"
fi
ok "API is up with the new configuration"

METHODS=$(curl -fsS --max-time 10 'http://127.0.0.1:4000/api/payments/methods?amount=10000000' || echo '[]')
if grep -q '"ONLINE"' <<<"$METHODS"; then ok "checkout offers online payment (Zarinpal) and nothing simulated"; else warn "online payment is not offered: $METHODS"; fi

SMS_CODE=$(( RANDOM % 90000 + 10000 ))
SMS_RESULT=$(as_app "node -e '
  const { MelipayamakSmsProvider } = require(\"./dist/modules/notifications/sms/melipayamak-sms.provider\");
  const p = new MelipayamakSmsProvider(process.env.MELIPAYAMAK_USERNAME, process.env.MELIPAYAMAK_PASSWORD, { otp: Number(process.env.MELIPAYAMAK_OTP_BODY_ID) });
  p.send(process.argv[1], { kind: \"otp\", code: process.argv[2] }).then(() => console.log(\"OK\"), (e) => console.log(\"FAIL \" + e.message));
' $ADMIN_PHONE $SMS_CODE" 2>/dev/null | tail -1)
SMS_OK=false
case "$SMS_RESULT" in
  OK)
    SMS_OK=true
    ok "Melipayamak accepted a test login code ($SMS_CODE) for $ADMIN_PHONE — check that it arrived" ;;
  "FAIL Melipayamak unreachable"*)
    warn "this server got no answer from Melipayamak: ${SMS_RESULT#FAIL Melipayamak unreachable: }"
    abroad_hint Melipayamak ;;
  *)
    warn "Melipayamak rejected the test message: ${SMS_RESULT:-no answer}"
    warn "check the username, the web-service password and that login pattern $MP_OTP is approved" ;;
esac

ZP_RESULT=$(as_app "node -e '
  const { ZarinpalProvider } = require(\"./dist/modules/payments/providers/online/zarinpal.provider\");
  const p = new ZarinpalProvider(process.env.ZARINPAL_MERCHANT_ID, false);
  p.createPayment({ paymentId: \"go-live-check\", orderId: \"go-live-check\", orderNumber: \"GOLIVE\", amount: 1000,
    customer: { phone: process.argv[1] }, description: \"آزمایش اتصال درگاه\", items: [],
    callbackUrl: process.env.WEB_URL + \"/api/payments/callback/zarinpal/go-live-check\" })
    .then(() => console.log(\"OK\"), (e) => console.log(\"FAIL \" + e.message));
' $ADMIN_PHONE" 2>/dev/null | tail -1)
ZP_OK=false
case "$ZP_RESULT" in
  OK)
    ZP_OK=true
    ok "Zarinpal accepted the merchant id and the site's address (a test payment was opened, nothing was charged)" ;;
  "FAIL Zarinpal unreachable"*)
    warn "this server got no answer from Zarinpal: ${ZP_RESULT#FAIL Zarinpal unreachable: }"
    abroad_hint Zarinpal ;;
  *"code -10"*|*"code -11"*|*"code -15"*|*"code -16"*)
    warn "Zarinpal refused this merchant: ${ZP_RESULT#FAIL }"
    warn "check the merchant id; if it is right, the merchant is not active yet or Zarinpal refuses"
    warn "this server's IP ($SERVER_IP) — see the IP settings of the terminal in the Zarinpal panel" ;;
  *)
    warn "Zarinpal refused: ${ZP_RESULT:-no answer}"
    warn "check the merchant id and that the website registered in Zarinpal is iphoneha.com" ;;
esac

if $SMS_OK && $ZP_OK; then
  printf '\n\033[1;32m✓ the store is live\033[0m\n'
else
  printf '\n\033[1;33m! the keys are saved, but the store is NOT ready for customers yet:\033[0m\n'
  $SMS_OK || echo "    - without SMS nobody can sign in, so nobody can order"
  $ZP_OK  || echo "    - without Zarinpal checkout stops at «اتصال به درگاه پرداخت برقرار نشد»"
  echo "  fix what the lines above say and run this script again — the one-time cleanup is not repeated."
  echo "  until SMS works you can still sign in to the admin panel with a code printed here:"
  echo "      bash $APP_DIR/deploy/admin-code.sh $ADMIN_PHONE"
fi
cat <<NEXT

next:
  1. sign in at https://iphoneha.com/admin/login with $ADMIN_PHONE (code by SMS, or from admin-code.sh)
  2. Products → enter the real price and stock of every model you sell
     (sample variants are out of stock until you do — nothing fake can be bought)
  3. Settings → store: address, email, Instagram, e-Namad id/code, warranty months, return days
  4. read /terms and /privacy once; they are written from those settings
  5. alerts for new instalment requests and paid orders (SMS, Telegram or Bale):
       bash $APP_DIR/deploy/alerts.sh
NEXT
