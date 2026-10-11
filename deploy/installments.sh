#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# iphoneha.com — connect the installment services: SnapPay (اسنپ‌پی),
# Tara (تارا), DigiPay (دیجی‌پی), Bajet (باجت) and AzkiVam (ازکی‌وام).
#
# Run as root, after bootstrap-root.sh and go-live.sh, once a service has sent
# you its merchant keys (and again whenever keys change):
#
#     bash /home/iphoneha/app/deploy/installments.sh
#
# For each service you choose to:
#   [k] keep it as it is
#   [l] connect it with LIVE keys  — customers see it at checkout
#   [t] connect it with TEST keys  — the service's test environment: only the
#       store's staff see it (log in on the site with an admin's mobile), and
#       no money moves. For the test purchase a service asks for before it
#       sends the live keys. Tara and Bajet publish no test environment: [t]
#       needs the test address the service gave you.
#   [o] turn it off
#
# Keys are typed here, hidden, and saved only in /home/iphoneha/app/.env (the
# previous one is kept as a backup). Then ONLY the API is restarted — the site
# and every other site on this server keep running — and each connected
# service is checked from this server. Nothing is bought.
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
[ -f "$APP_DIR/apps/api/dist/modules/payments/providers/installment/live/factory.js" ] \
  || die "this release of the store cannot connect installment services yet — install the latest one first"
[ -f "$APP_DIR/deploy/installment-check.cjs" ] || die "$APP_DIR/deploy/installment-check.cjs is missing — install the latest release"

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

# a value .env can hold between single quotes: no ' and no line break
storable() { [[ $1 != *"'"* && $1 != *$'\n'* && $1 != *$'\r'* ]]; }

ask_plain() {  # ask_plain VAR "question" — required, visible, no spaces
  local answer
  while :; do
    read -r -p "  $2: " answer
    answer=${answer//[[:space:]]/}
    if [ -z "$answer" ]; then warn "this one is needed"; continue; fi
    storable "$answer" || { warn "it contains ' — that cannot be stored; check what you pasted"; continue; }
    printf -v "$1" '%s' "$answer"; return 0
  done
}

ask_secret() {  # ask_secret VAR "question" — required, hidden
  local answer
  while :; do
    read -r -s -p "  $2 (hidden): " answer; echo
    answer=${answer%$'\r'}
    if [ -z "$answer" ]; then warn "nothing was typed — paste it and press Enter"; continue; fi
    if [[ $answer =~ ^[[:space:]]|[[:space:]]$ ]]; then
      warn "it starts or ends with a space — probably a copying slip; paste it again"; continue
    fi
    storable "$answer" || { warn "it contains ' — this setup cannot store that; ask the service for one without '"; continue; }
    printf -v "$1" '%s' "$answer"
    ok "received (${#answer} characters)"
    return 0
  done
}

# «staging», «sandbox», «uat», «test» or «dev» as a word of the host name — the API refuses those for live keys
is_test_host() {
  local host=${1#https://}
  host=${host%%/*}; host=${host%%:*}; host=${host,,}
  [[ $host =~ (^|[.-])(staging|stage|sandbox|uat|test|dev)([.-]|$) || $host == *.snappcloud.io ]]
}

ask_address() {  # ask_address VAR MODE DEFAULT NAME — Enter keeps the service's own address (none for a test host it does not publish)
  local answer
  while :; do
    if [ -n "$3" ]; then
      read -r -p "  $4's API address (Enter = $3, $4's own): " answer || die "input ended — nothing was changed"
    else
      echo "  $4 publishes no test environment: type the TEST address $4 gave you"
      read -r -p "  (or press Ctrl-C and connect the live keys with [l]): " answer || die "input ended — nothing was changed"
    fi
    answer=${answer//[[:space:]]/}; answer=${answer%/}
    if [ -z "$answer" ] && [ -z "$3" ]; then warn "a test address is needed for [t]"; continue; fi
    if [ -z "$answer" ] || [ "$answer" = "$3" ]; then printf -v "$1" '%s' ""; return 0; fi
    [[ $answer =~ ^https://[^/[:space:]\']+ ]] || { warn "an address starts with https:// — or press Enter"; continue; }
    if [ "$2" = live ] && is_test_host "$answer"; then
      warn "that is a test address — test keys are connected with [t], not [l]"; continue
    fi
    printf -v "$1" '%s' "$answer"; return 0
  done
}

SERVER_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)
[ -n "$SERVER_IP" ] || SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
OWNER_PHONE=$(env_get SEED_ADMIN_PHONE)
WEB_URL=$(env_get WEB_URL); WEB_URL=${WEB_URL:-https://iphoneha.com}

# in the order customers see them at checkout
SERVICES=(SNAPPAY TARA DIGIPAY BOJET AZKIVAM)
declare -A NAME=([SNAPPAY]=SnapPay [TARA]=Tara [DIGIPAY]=DigiPay [BOJET]=Bajet [AZKIVAM]=AzkiVam)
declare -A FA=([SNAPPAY]=اسنپ‌پی [TARA]=تارا [DIGIPAY]=دیجی‌پی [BOJET]=باجت [AZKIVAM]=ازکی‌وام)
# the .env prefix of a service's keys (the BOJET method is spelled Bajet by the bank)
declare -A PREFIX=([SNAPPAY]=SNAPPAY [TARA]=TARA [DIGIPAY]=DIGIPAY [BOJET]=BAJET [AZKIVAM]=AZKIVAM)
declare -A LIVE_URL=(
  [SNAPPAY]=https://api.snapppay.ir
  [TARA]=https://pay.tara360.ir/pay
  [DIGIPAY]=https://api.mydigipay.com/digipay/api
  [BOJET]=https://jetpay.mybajet.ir
  [AZKIVAM]=https://api.azkivam.com
)
# empty: the service publishes no test environment — [t] asks for the address it gave you
declare -A TEST_URL=(
  [SNAPPAY]=https://fms-gateway-staging.apps.public.okd4.teh-1.snappcloud.io
  [TARA]=
  [DIGIPAY]=https://uat.mydigipay.info/digipay/api
  [BOJET]=
  [AZKIVAM]=https://api.azkivam.com
)
# every key a service may have in .env; «off» removes them all
declare -A ALL_KEYS=(
  [SNAPPAY]="SNAPPAY_BASE_URL SNAPPAY_CLIENT_ID SNAPPAY_CLIENT_SECRET SNAPPAY_USERNAME SNAPPAY_PASSWORD SNAPPAY_COMMISSION_TYPE"
  [TARA]="TARA_BASE_URL TARA_USERNAME TARA_PASSWORD TARA_SERVICE_ID TARA_GROUP_CODE"
  [DIGIPAY]="DIGIPAY_BASE_URL DIGIPAY_CLIENT_ID DIGIPAY_CLIENT_SECRET DIGIPAY_USERNAME DIGIPAY_PASSWORD DIGIPAY_TICKET_TYPE DIGIPAY_VERIFY_STYLE DIGIPAY_SELLER_ID DIGIPAY_SUPPLIER_ID"
  [BOJET]="BAJET_BASE_URL BAJET_USERNAME BAJET_PASSWORD BAJET_TERMINAL_ID BAJET_PRODUCT_TYPE"
  [AZKIVAM]="AZKIVAM_BASE_URL AZKIVAM_MERCHANT_ID AZKIVAM_API_KEY"
)

mode_of() {  # mode_of SNAPPAY → live | sandbox | off (mock, empty or a typo is off in production)
  local driver
  driver=$(env_get "PAYMENT_$1_DRIVER"); driver=${driver,,}; driver=${driver//[[:space:]]/}
  case "$driver" in live|sandbox) printf '%s' "$driver" ;; *) printf off ;; esac
}

describe() {  # describe SNAPPAY MODE — one line, never a secret
  local who
  case "$1" in
    AZKIVAM) who="shop id $(env_get AZKIVAM_MERCHANT_ID)" ;;
    TARA) who="username $(env_get TARA_USERNAME | cut -c1-4)…, gateway code $(env_get TARA_SERVICE_ID)" ;;
    BOJET) who="terminal $(env_get BAJET_TERMINAL_ID)" ;;
    *) who="client id $(env_get "$1_CLIENT_ID" | cut -c1-4)…" ;;
  esac
  case "$2" in
    live) printf 'LIVE keys (%s) — offered to customers' "$who" ;;
    sandbox) printf 'TEST keys (%s) — offered to the staff only' "$who" ;;
    *) printf 'off — not offered' ;;
  esac
}

declare -A SETS=()      # KEY → value to write
declare -a UNSETS=()    # keys to remove
declare -A NEW_MODE=()  # service → live | sandbox | off after saving
CHANGED=0

turn_off() {  # turn_off SERVICE
  local key
  SETS["PAYMENT_$1_DRIVER"]=mock
  for key in ${ALL_KEYS[$1]}; do UNSETS+=("$key"); done
  NEW_MODE[$1]=off; CHANGED=1
}

connect() {  # connect SERVICE live|sandbox — asks for the keys; sets NEW_* only when all were given
  local service=$1 mode=$2 name=${NAME[$1]} prefix=${PREFIX[$1]} kind default_url address
  local a b c d commission merchant key group
  if [ "$mode" = live ]; then kind="LIVE"; default_url=${LIVE_URL[$service]}; else kind="TEST"; default_url=${TEST_URL[$service]}; fi
  echo "  Type the $kind keys exactly as $name sent them (secrets stay hidden)."
  case "$service" in
    SNAPPAY)
      ask_plain a "client_id"
      ask_secret b "client_secret"
      ask_plain c "username"
      ask_secret d "password"
      while :; do
        read -r -p "  commissionType — the commission code SnapPay gave you for your contract (Enter = 100): " commission || true
        commission=$(digits "${commission:-100}")
        [[ $commission =~ ^[0-9]+$ ]] && [ "$commission" -gt 0 ] && break
        warn "the commission code is a number"
      done
      ask_address address "$mode" "$default_url" "$name"
      SETS[SNAPPAY_CLIENT_ID]=$a; SETS[SNAPPAY_CLIENT_SECRET]=$b
      SETS[SNAPPAY_USERNAME]=$c; SETS[SNAPPAY_PASSWORD]=$d
      if [ "$commission" = 100 ]; then UNSETS+=(SNAPPAY_COMMISSION_TYPE); else SETS[SNAPPAY_COMMISSION_TYPE]=$commission; fi
      ;;
    DIGIPAY)
      ask_plain a "client_id"
      ask_secret b "client_secret"
      ask_plain c "username"
      ask_secret d "password"
      ask_address address "$mode" "$default_url" "$name"
      SETS[DIGIPAY_CLIENT_ID]=$a; SETS[DIGIPAY_CLIENT_SECRET]=$b
      SETS[DIGIPAY_USERNAME]=$c; SETS[DIGIPAY_PASSWORD]=$d
      ;;
    TARA)
      ask_plain a "username (نام کاربری تارا)"
      ask_secret b "password (رمز عبور درگاه تارا)"
      ask_plain c "gateway code (کد درگاه تارا / serviceId)"
      read -r -p "  merchandise group code of phones (کد گروه کالا; Enter = not yet — the check below lists your groups): " group || true
      group=$(digits "${group:-}")
      ask_address address "$mode" "$default_url" "$name"
      SETS[TARA_USERNAME]=$a; SETS[TARA_PASSWORD]=$b; SETS[TARA_SERVICE_ID]=$c
      if [ -n "$group" ]; then SETS[TARA_GROUP_CODE]=$group; else UNSETS+=(TARA_GROUP_CODE); fi
      ;;
    BOJET)
      ask_plain a "username"
      ask_secret b "password"
      ask_plain c "terminalId (شمارهٔ ترمینال باجت)"
      ask_address address "$mode" "$default_url" "$name"
      SETS[BAJET_USERNAME]=$a; SETS[BAJET_PASSWORD]=$b; SETS[BAJET_TERMINAL_ID]=$c
      ;;
    AZKIVAM)
      while :; do
        read -r -p "  merchant id (شناسهٔ پذیرنده, a number): " merchant || true
        merchant=$(digits "${merchant:-}")
        [[ $merchant =~ ^[0-9]+$ ]] && break
        warn "the merchant id is a number"
      done
      while :; do
        ask_secret key "API key (64 characters, 0-9 and a-f)"
        key=${key//[[:space:]]/}
        [[ $key =~ ^[0-9A-Fa-f]{64}$ ]] && break
        warn "an AzkiVam API key is 64 characters of 0-9 and a-f — this one is ${#key}; copy it again"
      done
      ask_address address "$mode" "$default_url" "$name"
      SETS[AZKIVAM_MERCHANT_ID]=$merchant; SETS[AZKIVAM_API_KEY]=$key
      ;;
  esac
  if [ -n "$address" ]; then SETS["${prefix}_BASE_URL"]=$address; else UNSETS+=("${prefix}_BASE_URL"); fi
  SETS["PAYMENT_${service}_DRIVER"]=$mode
  NEW_MODE[$service]=$mode; CHANGED=1
}

step=0
LAST=$(( ${#SERVICES[@]} + 1 ))
for service in "${SERVICES[@]}"; do
  step=$((step + 1))
  bold "$step/$LAST  ${NAME[$service]} (${FA[$service]})"
  mode=$(mode_of "$service")
  NEW_MODE[$service]=$mode
  echo "  now: $(describe "$service" "$mode")"
  while :; do
    if [ "$mode" = off ]; then
      read -r -p "  connect it with [l]ive keys, [t]est keys, or [k]eep it off? [k]: " CHOICE || true
    else
      read -r -p "  [k]eep, switch to [l]ive keys, to [t]est keys, or turn it [o]ff? [k]: " CHOICE || true
    fi
    CHOICE=${CHOICE:-k}; CHOICE=${CHOICE,,}
    case "$CHOICE" in k*|l*|t*|o*) break ;; esac
    warn "type k, l, t or o"
  done
  case "$CHOICE" in
    l*|t*)
      [[ $CHOICE == t* ]] && m=sandbox || m=live
      case "$service" in
        SNAPPAY) echo "  SnapPay answers only servers it has on file: give them this server's IP, ${SERVER_IP:-?}"
                 echo "  (for the test keys, and again for the live ones)." ;;
        *) echo "  if ${NAME[$service]} asks for this server's IP: ${SERVER_IP:-?}" ;;
      esac
      connect "$service" "$m"
      ;;
    o*) [ "$mode" = off ] || turn_off "$service" ;;
  esac
done

# ── save, restart the API, check ────────────────────────────────────────────
bold "$LAST/$LAST  saving and checking"
for service in "${SERVICES[@]}"; do
  printf '  %-8s %s\n' "${NAME[$service]}" "$(case "${NEW_MODE[$service]}" in
    live) echo "LIVE keys — offered to customers" ;;
    sandbox) echo "TEST keys — offered to the staff only" ;;
    *) echo "off" ;;
  esac)"
done

if [ "$CHANGED" = 1 ]; then
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

  for key in ${UNSETS[@]+"${UNSETS[@]}"}; do [ -n "${SETS[$key]+x}" ] || unset_env "$key"; done
  for key in "${!SETS[@]}"; do set_env "$key" "${SETS[$key]}"; done
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
else
  ok "nothing changed — checking the connected services as they are"
fi

as_app() {  # runs a command as the app user in apps/api, with .env loaded
  su -s /bin/bash -l $USER_NAME -c "cd $APP_DIR/apps/api && set -a && . $ENV_FILE && set +a && $1"
}

explain() {  # explain SERVICE "OK …|UNSURE …|FAIL …"
  local name=${NAME[$1]} line=$2
  case "$line" in
    OK\ *) ok "${line#OK }" ;;
    UNSURE\ *) warn "${line#UNSURE } — send this line to your developer" ;;
    *unreachable*)
      warn "no answer from $name (${line#FAIL })"
      warn "  $name answers only the servers it has on file: give them this server's IP, $SERVER_IP."
      warn "  If it answers only servers inside Iran, this server (outside Iran) needs a relay there — see deploy/README.md" ;;
    *"rsCode 18"*) warn "AzkiVam says the signature is wrong: this API key is not the one for this shop id (${line#FAIL })" ;;
    *"rsCode 15"*) warn "AzkiVam refused this shop id or this server (${line#FAIL }) — check the shop id; if it is right, give AzkiVam this server's IP, $SERVER_IP" ;;
    *"rsCode 12"*) warn "AzkiVam says the shop is not active yet (${line#FAIL })" ;;
    *"sign-in refused (HTTP 400)"*|*"sign-in refused (HTTP 401)"*|*"HTTP 401"*)
      warn "$name refused these keys (${line#FAIL })"
      warn "  type them again exactly as $name sent them — TEST keys work only with [t], LIVE keys only with [l]" ;;
    *"HTTP 403"*) warn "$name refused this server (${line#FAIL }) — give $name this server's IP, $SERVER_IP" ;;
    *"code 1100006"*) warn "Bajet refused the sign-in (${line#FAIL }) — check the username, password and terminalId" ;;
    *"not offered"*|*"not connected"*) warn "$name ${line#FAIL }" ;;
    *) warn "$name: ${line#FAIL }" ;;
  esac
}

CHECKED=0
for service in "${SERVICES[@]}"; do
  [ "${NEW_MODE[$service]}" = off ] && continue
  CHECKED=1
  RESULT=$(as_app "node $APP_DIR/deploy/installment-check.cjs ${service,,}" 2>/dev/null | grep -E '^(OK|UNSURE|FAIL) ' | tail -n 1 || true)
  explain "$service" "${RESULT:-FAIL the check printed nothing}"
done
[ "$CHECKED" = 1 ] || ok "no installment service is connected"

STAFF_LOGIN=${OWNER_PHONE:-"an admin's mobile"}
cat <<NEXT

next:
  - terms shown to customers for each service (months, down payment, ceiling):
    $WEB_URL/admin/settings?tab=payments
  - a service on TEST keys is offered only to the staff: log in on the site (not
    the panel) with $STAFF_LOGIN, put a phone in the cart and pay with «… (آزمایشی)».
    No money moves; cancel that order in the panel afterwards (that tests the refund too).
  - once a service sends the LIVE keys, run this again and choose [l]
  - DigiPay settles a credit purchase only after delivery: mark those orders «تحویل شد»
    in the panel and the store tells DigiPay
  - Tara: the check above lists the merchandise groups of your contract; run this
    again and type the phones' group code so Tara accepts the invoices
  - cancelling a paid order in the panel gives the money back through the service
    (SnapPay, DigiPay, AzkiVam); Tara and Bajet have no refund API — the store marks
    the refund «pending» and you return the money from that service's own panel.
    A partial refund is always done in the service's own panel
NEXT
