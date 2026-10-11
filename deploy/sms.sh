#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# iphoneha.com — connect Melipayamak SMS on its own, without the Zarinpal key
# go-live.sh also asks for: login codes, «سفارش موفق», «پرداخت سفارش»,
# «ارسال شد», and for the store's own instalments «دفترچهٔ اقساط صادر شد»,
# «پرداخت قسط ثبت شد», the reminder before a due date and «قسط معوق».
#
#     bash /home/iphoneha/app/deploy/sms.sh
#
# The web-service password is typed hidden, here on the server, and goes only
# into /home/iphoneha/app/.env (the previous file is kept as a backup). Enter
# keeps a value that is already set. Only iphoneha-api is restarted; nothing
# else on this server is touched. At the end a real login code is sent to the
# mobile you choose, through the same pattern customers get.
# Every pattern except the login one is optional: a message without its pattern
# is simply not sent. Staff alert patterns stay in alerts.sh.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

USER_NAME=iphoneha
APP_DIR=/home/$USER_NAME/app
ENV_FILE=$APP_DIR/.env

bold() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$1"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || die "run this as root (WHM → Terminal)"
[ -f "$ENV_FILE" ] || die "$ENV_FILE is missing — run bootstrap-root.sh first"
[ -f "$APP_DIR/apps/api/dist/main.js" ] || die "the API is not built — run bootstrap-root.sh first"

digits() {  # Persian/Arabic digits → ASCII; spaces and dashes removed
  local s=$1 i
  local fa=(۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹) ar=(٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩)
  for i in 0 1 2 3 4 5 6 7 8 9; do s=${s//${fa[$i]}/$i}; s=${s//${ar[$i]}/$i}; done
  s=${s// /}; s=${s//-/}
  printf '%s' "$s"
}

env_get() {  # env_get KEY — its value in .env without the quotes ('' when unset)
  local line
  line=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 || true)
  line=${line#*=}
  line=${line#\'}; line=${line%\'}; line=${line#\"}; line=${line%\"}
  printf '%s' "$line"
}

set_env() {  # set_env KEY VALUE — replaces the line or appends it; single-quoted, never expanded
  local key=$1 value="'$2'" tmp
  tmp=$(mktemp)
  if grep -q "^$key=" "$ENV_FILE"; then
    K="$key" V="$value" awk 'index($0, ENVIRON["K"] "=") == 1 { print ENVIRON["K"] "=" ENVIRON["V"]; next } { print }' \
      "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"; printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
unset_env() { sed -i "/^$1=/d" "$ENV_FILE"; }

ask_body() {  # ask_body VAR "question" CURRENT REQUIRED — Enter keeps CURRENT, - removes it (optional ones)
  local answer hint
  if [ -n "$3" ]; then hint="Enter keeps $3"; else hint="Enter to skip"; fi
  [ "$4" = optional ] && [ -n "$3" ] && hint="$hint, - removes it"
  while :; do
    read -r -p "  $2 ($hint): " answer || die "input ended — nothing was changed"
    answer=${answer// /}
    if [ -z "$answer" ]; then
      if [ "$4" = required ] && [ -z "$3" ]; then warn "this one is needed"; continue; fi
      printf -v "$1" '%s' "$3"; return 0
    fi
    if [ "$answer" = "-" ] && [ "$4" = optional ]; then printf -v "$1" '%s' ""; return 0; fi
    answer=$(digits "$answer")
    if [[ $answer =~ ^[0-9]+$ ]]; then printf -v "$1" '%s' "$answer"; return 0; fi
    warn "the bodyId is a number (کد الگو in the Melipayamak panel)"
  done
}

CUR_USER=$(env_get MELIPAYAMAK_USERNAME)
CUR_PASS=$(env_get MELIPAYAMAK_PASSWORD)
CUR_OTP=$(env_get MELIPAYAMAK_OTP_BODY_ID)
CUR_PAID=$(env_get MELIPAYAMAK_ORDER_PAID_BODY_ID)
CUR_SHIPPED=$(env_get MELIPAYAMAK_ORDER_SHIPPED_BODY_ID)
CUR_CONFIRMED=$(env_get MELIPAYAMAK_ORDER_CONFIRMED_BODY_ID)
CUR_REMIND=$(env_get MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID)
CUR_OVERDUE=$(env_get MELIPAYAMAK_INSTALLMENT_OVERDUE_BODY_ID)
CUR_INST_PAID=$(env_get MELIPAYAMAK_INSTALLMENT_PAID_BODY_ID)
CUR_ISSUED=$(env_get MELIPAYAMAK_CONTRACT_ISSUED_BODY_ID)
CUR_DRIVER=$(env_get SMS_DRIVER)
ADMIN_PHONE=$(env_get SEED_ADMIN_PHONE)

bold "1/4  Melipayamak account (panel → web service)"
echo "  now: driver ${CUR_DRIVER:-console}, user ${CUR_USER:-–}, password ${CUR_PASS:+set}${CUR_PASS:-–}, login pattern ${CUR_OTP:-–}"
while :; do
  if [ -n "$CUR_USER" ]; then read -r -p "  web-service username [$CUR_USER]: " MP_USER || die "input ended — nothing was changed"; MP_USER=${MP_USER:-$CUR_USER}
  else read -r -p "  web-service username: " MP_USER || die "input ended — nothing was changed"; fi
  [[ $MP_USER =~ ^[A-Za-z0-9._@-]+$ ]] && break
  warn "the username has unexpected characters — try again"
done
while :; do
  if [ -n "$CUR_PASS" ]; then read -r -s -p "  web-service password (hidden, Enter keeps the current one): " MP_PASS || die "input ended — nothing was changed"
  else read -r -s -p "  web-service password (hidden): " MP_PASS || die "input ended — nothing was changed"; fi
  echo
  MP_PASS=${MP_PASS:-$CUR_PASS}
  [ -n "$MP_PASS" ] || { warn "empty password"; continue; }
  [[ $MP_PASS == *"'"* || $MP_PASS == *$'\n'* ]] && { warn "the password contains ' — set a web-service password without it"; continue; }
  break
done

bold "2/4  approved patterns (bodyId)"
echo "  the variables must be in this order: {0} {1} {2} {3} as shown"
ask_body MP_OTP "LOGIN — کد ورود شما: {0}" "$CUR_OTP" required
ask_body MP_CONFIRMED "ORDER OK — سفارش {0} به مبلغ {1} تومان با موفقیت ثبت شد" "$CUR_CONFIRMED" optional
ask_body MP_PAID "PAYMENT — پرداخت سفارش {0} با موفقیت انجام شد (used when ORDER OK is not set)" "$CUR_PAID" optional
ask_body MP_SHIPPED "SHIPPED — سفارش {0} ارسال شد. کد رهگیری: {1}" "$CUR_SHIPPED" optional
echo "  the store's own instalments (cheque / promissory note):"
ask_body MP_ISSUED "BOOKLET — دفترچه اقساط قرارداد {0} صادر شد: {1} قسط {2} تومانی، اولین سررسید {3}" "$CUR_ISSUED" optional
ask_body MP_INST_PAID "INSTALMENT PAID — پرداخت قسط {0} قرارداد {1} به مبلغ {2} تومان ثبت شد. مانده: {3} تومان" "$CUR_INST_PAID" optional
ask_body MP_REMIND "REMINDER — یادآوری قسط قرارداد {0} به مبلغ {1} تومان با سررسید {2}" "$CUR_REMIND" optional
ask_body MP_OVERDUE "OVERDUE — قسط قرارداد {0} به مبلغ {1} تومان از سررسید {2} پرداخت نشده است (REMINDER is used when unset)" "$CUR_OVERDUE" optional

while :; do
  if [ -n "$ADMIN_PHONE" ]; then read -r -p "  send the test code to [$ADMIN_PHONE]: " TEST_PHONE || die "input ended — nothing was changed"; TEST_PHONE=${TEST_PHONE:-$ADMIN_PHONE}
  else read -r -p "  send the test code to (09…): " TEST_PHONE || die "input ended — nothing was changed"; fi
  TEST_PHONE=$(digits "$TEST_PHONE")
  [[ $TEST_PHONE =~ ^09[0-9]{9}$ ]] && break
  warn "not a mobile number like 09121234567 — try again"
done

echo
echo "  user $MP_USER · password ${#MP_PASS} chars · login $MP_OTP · order ok ${MP_CONFIRMED:-–} · paid ${MP_PAID:-–} · shipped ${MP_SHIPPED:-–}"
echo "  booklet ${MP_ISSUED:-–} · instalment paid ${MP_INST_PAID:-–} · reminder ${MP_REMIND:-–} · overdue ${MP_OVERDUE:-–} · test → $TEST_PHONE"
read -r -p "  save and restart the API? [y/N]: " CONFIRM || die "input ended — nothing was changed"
[[ $CONFIRM =~ ^[Yy]$ ]] || die "nothing was changed"

bold "3/4  writing the keys"
BACKUP="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
install -m 600 -o $USER_NAME -g $USER_NAME "$ENV_FILE" "$BACKUP"
set_env SMS_DRIVER melipayamak
set_env MELIPAYAMAK_USERNAME "$MP_USER"
set_env MELIPAYAMAK_PASSWORD "$MP_PASS"
set_env MELIPAYAMAK_OTP_BODY_ID "$MP_OTP"
if [ -n "$MP_PAID" ]; then set_env MELIPAYAMAK_ORDER_PAID_BODY_ID "$MP_PAID"; else unset_env MELIPAYAMAK_ORDER_PAID_BODY_ID; fi
if [ -n "$MP_SHIPPED" ]; then set_env MELIPAYAMAK_ORDER_SHIPPED_BODY_ID "$MP_SHIPPED"; else unset_env MELIPAYAMAK_ORDER_SHIPPED_BODY_ID; fi
put_body() { if [ -n "$2" ]; then set_env "$1" "$2"; else unset_env "$1"; fi; }
put_body MELIPAYAMAK_ORDER_CONFIRMED_BODY_ID "$MP_CONFIRMED"
put_body MELIPAYAMAK_CONTRACT_ISSUED_BODY_ID "$MP_ISSUED"
put_body MELIPAYAMAK_INSTALLMENT_PAID_BODY_ID "$MP_INST_PAID"
put_body MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID "$MP_REMIND"
put_body MELIPAYAMAK_INSTALLMENT_OVERDUE_BODY_ID "$MP_OVERDUE"
set_env DEV_EXPOSE_OTP false
chown $USER_NAME:$USER_NAME "$ENV_FILE"; chmod 600 "$ENV_FILE"
ok ".env updated (previous version kept as $(basename "$BACKUP"))"

systemctl restart iphoneha-api
for _ in $(seq 1 30); do curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/api/health 2>/dev/null && break; sleep 2; done
if ! curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/api/health; then
  cp "$BACKUP" "$ENV_FILE"; systemctl restart iphoneha-api
  die "the API did not start with these settings — the previous .env was put back"
fi
ok "API restarted with SMS through Melipayamak"

bold "4/4  test: a real login code to $TEST_PHONE"
SMS_CODE=$(( RANDOM % 90000 + 10000 ))
SMS_RESULT=$(su -s /bin/bash -l $USER_NAME -c "cd $APP_DIR/apps/api && set -a && . $ENV_FILE && set +a && node -e '
  const { MelipayamakSmsProvider } = require(\"./dist/modules/notifications/sms/melipayamak-sms.provider\");
  const p = new MelipayamakSmsProvider(process.env.MELIPAYAMAK_USERNAME, process.env.MELIPAYAMAK_PASSWORD, { otp: Number(process.env.MELIPAYAMAK_OTP_BODY_ID) });
  p.send(process.argv[1], { kind: \"otp\", code: process.argv[2] }).then(() => console.log(\"OK\"), (e) => console.log(\"FAIL \" + e.message));
' $TEST_PHONE $SMS_CODE" 2>/dev/null | tail -1)
case "$SMS_RESULT" in
  OK)
    ok "Melipayamak accepted the message: code $SMS_CODE should arrive on $TEST_PHONE within a minute"
    printf '\n\033[1;32m✓ SMS is on\033[0m — customers and the panel now get their login codes by SMS\n'
    if [ -n "$MP_REMIND" ]; then echo "  instalment reminders go out at 10:00 once reminders are turned on in the panel (تنظیمات ← دفتر اقساط)"; fi ;;
  "FAIL Melipayamak unreachable"*)
    warn "this server got no answer from Melipayamak: ${SMS_RESULT#FAIL Melipayamak unreachable: }"
    warn "Iranian services sometimes refuse servers abroad — see deploy/README.md («سرویس‌های ایرانی از سرور خارج»)" ;;
  *)
    warn "Melipayamak refused the test: ${SMS_RESULT:-no answer}"
    warn "check the username, the WEB-SERVICE password (not the panel one) and that pattern $MP_OTP is approved"
    warn "to undo: cp $BACKUP $ENV_FILE && systemctl restart iphoneha-api" ;;
esac
