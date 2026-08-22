#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?PRODUCTION_DATABASE_URL is required}"
: "${R2_ENDPOINT:?R2 endpoint is required}"
: "${R2_BUCKET:?R2 bucket is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?Backup passphrase is required}"

stamp="$(date -u +%F)"
dump_path="${RUNNER_TEMP:-/tmp}/edh-tracker-${stamp}.dump"
encrypted_path="${dump_path}.enc"

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$dump_path"
openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$dump_path" -out "$encrypted_path"
aws --endpoint-url "$R2_ENDPOINT" s3 cp "$encrypted_path" "s3://$R2_BUCKET/daily/${stamp}.dump.enc" --only-show-errors

if [ "$(date -u +%u)" = "7" ]; then
  aws --endpoint-url "$R2_ENDPOINT" s3 cp "$encrypted_path" "s3://$R2_BUCKET/weekly/${stamp}.dump.enc" --only-show-errors
fi
if [ "$(date -u +%d)" = "01" ]; then
  aws --endpoint-url "$R2_ENDPOINT" s3 cp "$encrypted_path" "s3://$R2_BUCKET/monthly/${stamp}.dump.enc" --only-show-errors
fi

prune_prefix() {
  local prefix="$1"
  local keep="$2"
  aws --endpoint-url "$R2_ENDPOINT" s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "${prefix}/" --query 'Contents[].Key' --output text \
    | tr '\t' '\n' | sort -r | tail -n "+$((keep + 1))" \
    | while IFS= read -r key; do
        if [ -n "$key" ] && [[ "$key" == "${prefix}/"* ]]; then
          aws --endpoint-url "$R2_ENDPOINT" s3 rm "s3://$R2_BUCKET/$key" --only-show-errors
        fi
      done
}

prune_prefix daily 7
prune_prefix weekly 4
prune_prefix monthly 6
echo "Encrypted backup ${stamp} uploaded and retention applied."
