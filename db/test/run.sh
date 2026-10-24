#!/bin/sh
# Runs the migrations and the access tests on a throw-away local Postgres (or on $PGURL when given, e.g. in CI).
set -eu
cd "$(dirname "$0")/.."
if [ -z "${PGURL:-}" ]; then
  BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1); DIR=$(mktemp -d); PORT=55432
  chown -R postgres "$DIR" 2>/dev/null || true
  RUN="su postgres -s /bin/sh -c"
  [ "$(id -u)" = 0 ] || RUN="sh -c"
  $RUN "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null && $BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"
  trap "$RUN '$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null'; rm -rf $DIR" EXIT
  sleep 1
  PGURL="postgresql://postgres@localhost:$PORT/postgres"
fi
P="psql $PGURL -X -q -v ON_ERROR_STOP=1"
$P -c 'drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;' >/dev/null
$P -c 'drop role if exists anon; drop role if exists authenticated;' >/dev/null 2>&1 || true
$P -f test/supabase_stub.sql >/dev/null
for f in migrations/*.sql; do $P -f "$f" >/dev/null; done
$P -f test/access.sql
