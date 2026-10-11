#!/usr/bin/env bash
# Nightly backup: database dump + uploaded product images.
# Install as root:  ln -s /home/iphoneha/app/deploy/backup.sh /etc/cron.daily/iphoneha-backup
set -euo pipefail

APP_DIR=/home/iphoneha/app
DEST=/home/iphoneha/backups
KEEP_DAYS=14
STAMP=$(date +%F_%H%M)

# dumps hold every customer's name, phone and address: root-only, always
umask 077
install -d -m 700 "$DEST"

# database — dumped from inside the container (unix socket, port 55432), so no
# client version mismatch and no password needed
docker exec iphoneha-postgres pg_dump -p 55432 -U iphoneha -d iphoneha --format=custom \
  > "$DEST/db_$STAMP.dump"

# product images
tar -czf "$DEST/storage_$STAMP.tar.gz" -C "$APP_DIR" storage 2>/dev/null || true

# the .env holds every secret — keep a copy with the backups, readable by root only
install -m 600 "$APP_DIR/.env" "$DEST/env_$STAMP.bak"

find "$DEST" -type f -mtime "+$KEEP_DAYS" -delete
echo "backup done: $DEST/db_$STAMP.dump"
