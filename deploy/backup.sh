#!/usr/bin/env bash
# Nightly complete backup: database, uploaded product images and private env.
# Install as root: ln -s /home/iphoneha/app/deploy/backup.sh /etc/cron.daily/iphoneha-backup
set -euo pipefail
APP_DIR=/home/iphoneha/app
DEST=/home/iphoneha/backups
KEEP_DAYS=14
STAMP=$(date +%F_%H%M%S)
umask 077
install -d -m 700 "$DEST"
# Prevent a scheduled and manual backup from publishing concurrently.
exec 9>"$DEST/.backup.lock"
flock -n 9 || { echo "another backup is running" >&2; exit 1; }
WORK_DIR=$(mktemp -d "$DEST/.incomplete.XXXXXX")
trap 'rm -rf -- "$WORK_DIR"' EXIT
# Unix socket inside the container: no credentials passed on the command line.
docker exec iphoneha-postgres pg_dump -p 55432 -U iphoneha -d iphoneha --format=custom > "$WORK_DIR/db_$STAMP.dump"
# Validate the archive catalogue before publishing; full restore is a separate check.
docker exec -i iphoneha-postgres pg_restore --list < "$WORK_DIR/db_$STAMP.dump" > /dev/null
tar -czf "$WORK_DIR/storage_$STAMP.tar.gz" -C "$APP_DIR" storage
tar -tzf "$WORK_DIR/storage_$STAMP.tar.gz" > /dev/null
install -m 600 "$APP_DIR/.env" "$WORK_DIR/env_$STAMP.bak"
(cd "$WORK_DIR" && sha256sum "db_$STAMP.dump" "storage_$STAMP.tar.gz" "env_$STAMP.bak" > "manifest_$STAMP.sha256")
for FILE in "$WORK_DIR"/*; do mv "$FILE" "$DEST/"; done
# Monitoring accepts this marker only after every required component succeeds.
touch "$DEST/backup_$STAMP.complete"
find "$DEST" -maxdepth 1 -type f \( -name 'db_*.dump' -o -name 'storage_*.tar.gz' -o -name 'env_*.bak' -o -name 'manifest_*.sha256' -o -name 'backup_*.complete' \) -mtime "+$KEEP_DAYS" -delete
echo "complete backup: $DEST/backup_$STAMP.complete"
