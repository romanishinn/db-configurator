#!/bin/sh
# Applies the migrations in db/migrations that the database has not seen yet, each in one transaction.
# Usage: DATABASE_URL=postgresql://… sh db/migrate.sh   (in CI the URL comes from the SUPABASE_DB_URL secret)
set -eu
cd "$(dirname "$0")"
: "${DATABASE_URL:?DATABASE_URL is not set}"
P="psql $DATABASE_URL -X -q -v ON_ERROR_STOP=1"
$P -c "create schema if not exists ops; create table if not exists ops.migrations (name text primary key, applied_at timestamptz not null default now());"
for f in migrations/*.sql; do
  n=$(basename "$f")
  if [ "$($P -tAc "select 1 from ops.migrations where name = '$n'")" = 1 ]; then continue; fi
  echo "applying $n"
  $P -1 -f "$f" -c "insert into ops.migrations (name) values ('$n')"
done
echo "database is up to date"
