#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# iphoneha.com — staff alerts: an SMS and/or a Telegram or Bale message when a
# customer sends the «خرید قسطی با چک یا سفته» form, or an order is paid; and
# the reminder SMS customers get before an instalment of the store's own
# cheque or promissory-note plan is due («دفتر اقساط»).
#
# Run as root, whenever you like, after bootstrap-root.sh (SMS also needs
# go-live.sh, which connects Melipayamak):
#
#     bash /home/iphoneha/app/deploy/alerts.sh
#
# It asks for:
#   1. the bodyId of three Melipayamak patterns (the texts to register are shown)
#   2. a Telegram or Bale bot token — typed here, hidden, never sent anywhere
#      but to that bot API; the chat is found by itself once you message the bot
# Both are optional and saved only in /home/iphoneha/app/.env (the old one is
# kept as a backup). Then ONLY the API is restarted — the site keeps running —
# and a test message goes out through each channel.
#
# Who gets the SMS is chosen in the panel: تنظیمات ← هشدارها (none listed =
# the owner's mobile). Safe to run again to change or remove anything.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

USER_NAME=iphoneha
HOME_DIR=/home/$USER_NAME
APP_DIR=$HOME_DIR/app
ENV_FILE=$APP_DIR/.env
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

bold() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$1"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || die "run this as root"
[ -f "$ENV_FILE" ] || die "$ENV_FILE is missing — run bootstrap-root.sh first"
[ -f "$APP_DIR/apps/api/dist/modules/notifications/bot/alert-bot.js" ] \
  || die "this release of the store has no alerts yet — install the latest one first"
NODE_BIN=$(command -v node || true)
[ -x "${NODE_BIN:-}" ] || NODE_BIN=/bin/node
[ -x "$NODE_BIN" ] || die "node was not found on this server"

# Persian/Arabic digits → ASCII, spaces removed (plain bash: `tr` would mangle multibyte digits)
digits() {
  local s=$1 i
  local fa=(۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹) ar=(٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩)
  for i in 0 1 2 3 4 5 6 7 8 9; do s=${s//${fa[$i]}/$i}; s=${s//${ar[$i]}/$i}; done
  s=${s// /}
  printf '%s' "$s"
}

env_get() {  # env_get KEY — its value in .env without the quotes ('' when unset)
  local line
  line=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 || true)
  line=${line#*=}
  line=${line#\'}; line=${line%\'}; line=${line#\"}; line=${line%\"}
  printf '%s' "$line"
}

ask_secret() {  # ask_secret VAR "question"
  local answer
  read -r -s -p "  $2: " answer; echo
  printf -v "$1" '%s' "$answer"
}

ask_body() {  # ask_body VAR "question" CURRENT — Enter keeps CURRENT, - removes it
  local answer hint
  if [ -n "$3" ]; then hint="Enter keeps $3, - removes it"; else hint="Enter to skip"; fi
  while :; do
    read -r -p "  $2 ($hint): " answer
    answer=${answer// /}
    if [ -z "$answer" ]; then printf -v "$1" '%s' "$3"; return 0; fi
    if [ "$answer" = "-" ]; then printf -v "$1" '%s' ""; return 0; fi
    answer=$(digits "$answer")
    if [[ $answer =~ ^[0-9]+$ ]]; then printf -v "$1" '%s' "$answer"; return 0; fi
    warn "the bodyId is a number (کد الگو in the Melipayamak panel)"
  done
}

# the token travels in the environment of that one process, never on a command line
bot_call() {  # bot_call SERVICE TOKEN getme|chats
  ALERT_BOT_SERVICE=$1 ALERT_BOT_TOKEN=$2 "$NODE_BIN" "$HERE/alert-bot.mjs" "$3" 2>/dev/null | tail -n 20 || true
}

SERVER_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)
[ -n "$SERVER_IP" ] || SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)

SMS_DRIVER=$(env_get SMS_DRIVER); SMS_DRIVER=${SMS_DRIVER:-console}
CUR_REQ=$(env_get MELIPAYAMAK_ALERT_REQUEST_BODY_ID)
CUR_ORDER=$(env_get MELIPAYAMAK_ALERT_ORDER_BODY_ID)
CUR_REMIND=$(env_get MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID)
CUR_SERVICE=$(env_get ALERT_BOT_SERVICE); CUR_SERVICE=${CUR_SERVICE:-telegram}
CUR_TOKEN=$(env_get ALERT_BOT_TOKEN)
CUR_CHAT=$(env_get ALERT_BOT_CHAT_ID)
OWNER_PHONE=$(env_get SEED_ADMIN_PHONE)
WEB_URL=$(env_get WEB_URL); WEB_URL=${WEB_URL:-https://iphoneha.com}

NEW_REQ=$CUR_REQ; NEW_ORDER=$CUR_ORDER; NEW_REMIND=$CUR_REMIND
NEW_SERVICE=$CUR_SERVICE; NEW_TOKEN=$CUR_TOKEN; NEW_CHAT=$CUR_CHAT
BOT_LABEL="chat $CUR_CHAT"

# ── 1. SMS ──────────────────────────────────────────────────────────────────
bold "1/3  SMS alerts"
if [ "$SMS_DRIVER" != melipayamak ]; then
  warn "SMS is not connected to Melipayamak yet (SMS_DRIVER=$SMS_DRIVER): run go-live.sh first."
  warn "Until then the SMS part is skipped; the bot below works without it."
else
  cat <<'PATTERNS'
  Melipayamak sends only approved texts (patterns). In the Melipayamak panel, under
  the shared service line (وب‌سرویس خدماتی / خط خدماتی اشتراکی), add these patterns,
  wait for the approval, then type their bodyId (کد الگو) below:

    new request   آیفونی‌ها: درخواست خرید قسطی تازه، شماره {0} با {1}. در پنل پیگیری کنید.
    paid order    آیفونی‌ها: سفارش {0} به مبلغ {1} تومان پرداخت شد.
    reminder      آیفونی‌ها: یادآوری قسط قرارداد {0} به مبلغ {1} تومان با سررسید {2}.

  (the first two go to the staff: {0} is the request or order number, {1} «چک صیادی»/«سفته»
   or the amount. The reminder goes to customers of the store's own instalments: {0} the
   contract number, {1} what is left of the instalment, {2} its Jalali due date)
PATTERNS
  ask_body NEW_REQ "bodyId of the NEW REQUEST pattern" "$CUR_REQ"
  ask_body NEW_ORDER "bodyId of the PAID ORDER pattern" "$CUR_ORDER"
  ask_body NEW_REMIND "bodyId of the INSTALMENT REMINDER pattern" "$CUR_REMIND"
fi

# ── 2. bot ──────────────────────────────────────────────────────────────────
bold "2/3  Telegram or Bale bot"

setup_bot() {  # setup_bot telegram|bale — sets NEW_* only when everything worked
  local service=$1 name token result username chats pick count i id type title
  local -a lines
  if [ "$service" = bale ]; then
    name=Bale
    echo "  in Bale: open the chat with @botfather → /newbot → pick a name → copy the token it sends"
  else
    name=Telegram
    echo "  in Telegram: open @BotFather → /newbot → pick a name and a username → copy the token it sends"
  fi
  while :; do
    ask_secret token "bot token (hidden)"
    token=${token//[[:space:]]/}
    [[ $token =~ ^[0-9]+:[A-Za-z0-9_-]{10,}$ ]] && break
    warn "a bot token looks like 123456789:AAH… — copy it again"
  done

  result=$(bot_call "$service" "$token" getme)
  case "$result" in
    OK\ *) username=${result#OK }; ok "$name accepted the token: the bot is @$username" ;;
    *"no answer"*)
      warn "this server got no answer from $name: ${result#FAIL }"
      [ "$service" = bale ] && warn "Bale may refuse servers outside Iran (this one is $SERVER_IP) — try Telegram instead"
      return 1 ;;
    *)
      warn "$name refused the token: ${result#FAIL }"
      warn "copy the token again from the bot father's message"
      return 1 ;;
  esac

  echo
  echo "  Now send the bot any message (e.g. «سلام»):"
  echo "    - from the account that should get the alerts: open @$username and press Start, or"
  echo "    - for your staff: add @$username to the group and send /start@$username there"
  for _ in 1 2 3 4 5; do
    read -r -p "  done? press Enter " _ || true
    chats=$(bot_call "$service" "$token" chats)
    case "$chats" in
      CHAT*) break ;;
      NONE) warn "nothing has reached @$username yet — send it a message, then press Enter" ;;
      *) warn "$name: ${chats#FAIL }" ;;
    esac
  done
  [[ $chats == CHAT* ]] || { warn "no chat found"; return 1; }

  mapfile -t lines <<<"$chats"
  count=${#lines[@]}
  pick=$count
  if [ "$count" -gt 1 ]; then
    echo "  these chats wrote to the bot:"
    for i in "${!lines[@]}"; do
      IFS=$'\t' read -r id type title <<<"${lines[$i]#CHAT }"
      echo "    $((i + 1))) $title ($type)"
    done
    while :; do
      read -r -p "  which one gets the alerts? [$count]: " pick
      pick=$(digits "${pick:-$count}")
      [[ $pick =~ ^[0-9]+$ ]] && [ "$pick" -ge 1 ] && [ "$pick" -le "$count" ] && break
      warn "type a number from the list"
    done
  fi
  IFS=$'\t' read -r id type title <<<"${lines[$((pick - 1))]#CHAT }"

  NEW_SERVICE=$service; NEW_TOKEN=$token; NEW_CHAT=$id
  BOT_LABEL="$title ($type) through @$username"
  ok "alerts will go to $BOT_LABEL"
}

if [ -n "$CUR_TOKEN" ]; then
  echo "  now: $CUR_SERVICE bot ${CUR_TOKEN%%:*}:… → chat $CUR_CHAT"
  read -r -p "  [k]eep it, set up [t]elegram or [b]ale instead, or [r]emove it? [k]: " CHOICE || true
  CHOICE=${CHOICE:-k}
else
  echo "  alerts in Telegram or Bale: create a bot there (free, a minute), and the store writes to you"
  read -r -p "  set up [t]elegram, [b]ale, or [n]o bot? [n]: " CHOICE || true
  CHOICE=${CHOICE:-n}
fi
case "${CHOICE,,}" in
  k*|n*) ;;
  r*) NEW_SERVICE=telegram; NEW_TOKEN=""; NEW_CHAT="" ;;
  t*) setup_bot telegram || warn "the bot was not changed" ;;
  b*) setup_bot bale || warn "the bot was not changed" ;;
  *) die "unknown choice «$CHOICE» — nothing was changed" ;;
esac

# ── 3. save, restart the API, test ─────────────────────────────────────────
bold "3/3  saving and testing"
echo "  SMS patterns:  new request ${NEW_REQ:-–}, paid order ${NEW_ORDER:-–}, reminder ${NEW_REMIND:-–}  (SMS service: $SMS_DRIVER)"
if [ -n "$NEW_TOKEN" ]; then
  echo "  bot:           $NEW_SERVICE ${NEW_TOKEN%%:*}:… → $BOT_LABEL"
else
  echo "  bot:           none"
fi

if [ "$NEW_REQ" = "$CUR_REQ" ] && [ "$NEW_ORDER" = "$CUR_ORDER" ] && [ "$NEW_REMIND" = "$CUR_REMIND" ] \
  && [ "$NEW_TOKEN" = "$CUR_TOKEN" ] \
  && [ "$NEW_CHAT" = "$CUR_CHAT" ] && [ "$NEW_SERVICE" = "$CUR_SERVICE" ]; then
  ok "nothing changed — the store keeps running as it is"
  exit 0
fi
read -r -p "  save these and restart the API (the site stays up)? [y/N]: " CONFIRM || true
[[ ${CONFIRM:-} =~ ^[Yy]$ ]] || die "nothing was changed"

BACKUP="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
install -m 600 -o $USER_NAME -g $USER_NAME "$ENV_FILE" "$BACKUP"

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
set_or_unset() { if [ -n "$2" ]; then set_env "$1" "$2"; else unset_env "$1"; fi; }

set_or_unset MELIPAYAMAK_ALERT_REQUEST_BODY_ID "$NEW_REQ"
set_or_unset MELIPAYAMAK_ALERT_ORDER_BODY_ID "$NEW_ORDER"
set_or_unset MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID "$NEW_REMIND"
if [ -n "$NEW_TOKEN" ]; then
  set_env ALERT_BOT_SERVICE "$NEW_SERVICE"
  set_env ALERT_BOT_TOKEN "$NEW_TOKEN"
  set_env ALERT_BOT_CHAT_ID "$NEW_CHAT"
else
  unset_env ALERT_BOT_SERVICE; unset_env ALERT_BOT_TOKEN; unset_env ALERT_BOT_CHAT_ID
fi
chown $USER_NAME:$USER_NAME "$ENV_FILE"; chmod 600 "$ENV_FILE"
ok ".env updated (previous version kept as $(basename "$BACKUP"))"

# only the API reads these; the website and every other site on this server keep running
systemctl restart iphoneha-api
for _ in $(seq 1 30); do curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/api/health 2>/dev/null && break; sleep 2; done
if ! curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:4000/api/health; then
  tail -n 20 $HOME_DIR/logs/api.error.log 2>/dev/null || true
  die "the API did not start again — the log above says why (restore with: cp $BACKUP $ENV_FILE && systemctl restart iphoneha-api)"
fi
ok "API is up with the new settings"

as_app() {  # runs a command as the app user in apps/api, with .env loaded
  su -s /bin/bash -l $USER_NAME -c "cd $APP_DIR/apps/api && set -a && . $ENV_FILE && set +a && $1"
}

if [ -n "$NEW_TOKEN" ]; then
  BOT_RESULT=$(as_app "node -e '
    const { BotApiAlertBot } = require(\"./dist/modules/notifications/bot/alert-bot\");
    const bot = new BotApiAlertBot(process.env.ALERT_BOT_SERVICE === \"bale\" ? \"bale\" : \"telegram\",
      process.env.ALERT_BOT_TOKEN, process.env.ALERT_BOT_CHAT_ID);
    bot.send([\"پیام آزمایشی آیفونی‌ها\", \"هشدار درخواست‌های خرید قسطی و سفارش‌های پرداخت‌شده به این گفتگو می‌آید.\"].join(\"\\n\"))
      .then(() => console.log(\"OK\"), (e) => console.log(\"FAIL \" + e.message));
  '" 2>/dev/null | tail -n 1 || true)
  case "$BOT_RESULT" in
    OK) ok "a test message went to $BOT_LABEL — check that it arrived" ;;
    *unreachable*)
      warn "this server got no answer from ${NEW_SERVICE^}: ${BOT_RESULT#FAIL }" ;;
    *" 401"*|*Unauthorized*)
      warn "${NEW_SERVICE^} refused the token (${BOT_RESULT#FAIL }) — copy it again and run this script again" ;;
    *" 403"*|*blocked*|*kicked*)
      warn "the chat blocked or removed the bot (${BOT_RESULT#FAIL }) — message the bot again, then run this script again" ;;
    *" 400"*|*"not found"*)
      warn "the chat was not found (${BOT_RESULT#FAIL }) — message the bot again, then run this script again" ;;
    *) warn "the bot could not write to the chat: ${BOT_RESULT:-no answer}" ;;
  esac
fi

if [ "$SMS_DRIVER" = melipayamak ] && { [ -n "$NEW_REQ" ] || [ -n "$NEW_ORDER" ] || [ -n "$NEW_REMIND" ]; }; then
  TEST_PHONE=$OWNER_PHONE
  if [[ ! ${TEST_PHONE:-} =~ ^09[0-9]{9}$ ]]; then
    read -r -p "  mobile for a test SMS (09…, Enter to skip): " TEST_PHONE || true
    TEST_PHONE=$(digits "${TEST_PHONE:-}")
  fi
  if [[ ${TEST_PHONE:-} =~ ^09[0-9]{9}$ ]]; then
    SMS_RESULT=$(as_app "node -e '
      const { MelipayamakSmsProvider } = require(\"./dist/modules/notifications/sms/melipayamak-sms.provider\");
      const env = process.env;
      const p = new MelipayamakSmsProvider(env.MELIPAYAMAK_USERNAME, env.MELIPAYAMAK_PASSWORD, {
        otp: Number(env.MELIPAYAMAK_OTP_BODY_ID),
        alertCreditRequest: Number(env.MELIPAYAMAK_ALERT_REQUEST_BODY_ID) || undefined,
        alertOrderPaid: Number(env.MELIPAYAMAK_ALERT_ORDER_BODY_ID) || undefined,
        installmentReminder: Number(env.MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID) || undefined,
      });
      const tests = [];
      if (env.MELIPAYAMAK_ALERT_REQUEST_BODY_ID) tests.push([\"new request\", { kind: \"alert-credit-request\", number: \"آزمایشی\", method: \"چک صیادی\" }]);
      if (env.MELIPAYAMAK_ALERT_ORDER_BODY_ID) tests.push([\"paid order\", { kind: \"alert-order-paid\", orderNumber: \"آزمایشی\", amount: \"۰\" }]);
      if (env.MELIPAYAMAK_INSTALLMENT_REMINDER_BODY_ID) tests.push([\"reminder\", { kind: \"installment-reminder\", contractNumber: \"آزمایشی\", amount: \"۰\", dueDate: \"۱۴۰۵/۰۱/۰۱\" }]);
      (async () => {
        for (const [label, message] of tests) {
          try { await p.send(process.argv[1], message); console.log(\"OK \" + label); }
          catch (e) { console.log(\"FAIL \" + label + \": \" + e.message); }
        }
      })();
    ' $TEST_PHONE" 2>/dev/null | grep -E '^(OK|FAIL) ' || true)
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      case "$line" in
        OK\ *) ok "Melipayamak accepted the ${line#OK } pattern — a test SMS is on its way to $TEST_PHONE" ;;
        *unreachable*) warn "no answer from Melipayamak (${line#FAIL }) — this server is $SERVER_IP; see deploy/README.md" ;;
        *) warn "Melipayamak refused the ${line#FAIL } — check that bodyId and that the pattern is approved" ;;
      esac
    done <<<"$SMS_RESULT"
  fi
fi

cat <<NEXT

next:
  - who gets the SMS: $WEB_URL/admin/settings?tab=alerts
    (no mobile listed = the owner's${OWNER_PHONE:+, $OWNER_PHONE}); both alerts can be switched off there
  - the «فرستادن پیام آزمایشی» button on that page tests SMS and bot at any time
  - the SMS and the bot carry the number, the method, the model and the amount;
    the customer's name and mobile stay in the panel
  - instalment reminders to customers are off until switched on in
    $WEB_URL/admin/settings?tab=ledger (with the reminder pattern set here)
NEXT
