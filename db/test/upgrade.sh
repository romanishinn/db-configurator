#!/bin/sh
# Upgrade path: 0001-0008 with "seller" data, then 0009 and 0010 each in one transaction (as db/migrate.sh does), then the access tests.
# Own database "upgrade_test" on $PGURL's server (or a throw-away local Postgres). UPGRADE_HOOK = extra SQL run before 0009 (mutation test).
set -eu
cd "$(dirname "$0")/.."
if [ -z "${PGURL:-}" ]; then
  BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1); DIR=$(mktemp -d); PORT=55433
  chown -R postgres "$DIR" 2>/dev/null || true
  RUN="su postgres -s /bin/sh -c"; [ "$(id -u)" = 0 ] || RUN="sh -c"
  $RUN "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null && $BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"
  trap "$RUN '$BIN/pg_ctl -D $DIR/data stop -m fast >/dev/null'; rm -rf $DIR" EXIT
  sleep 1
  PGURL="postgresql://postgres@localhost:$PORT/postgres"
fi
psql "$PGURL" -X -q -v ON_ERROR_STOP=1 -c 'drop database if exists upgrade_test' -c 'create database upgrade_test' >/dev/null
P="psql ${PGURL%/*}/upgrade_test -X -q -v ON_ERROR_STOP=1"
$P -c 'create schema if not exists public' >/dev/null
psql "${PGURL%/*}/upgrade_test" -X -q -f test/supabase_stub.sql >/dev/null 2>&1 || true  # roles may already exist on a shared server
for f in migrations/000[1-8]_*.sql; do $P -f "$f" >/dev/null; done
# stage 1: data of the old world (ids differ from access.sql)
$P >/dev/null <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'old-seller@db.test'), ('00000000-0000-0000-0000-0000000000e2', 'old-admin@db.test');
update public.profiles set role = 'seller' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-0000000000e2';
insert into public.leads (id, created_by, source, contact_name, phone) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'seller', 'Old', '+43 1');
insert into public.orders (lead_id, seller_id) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1');
SQL
[ -z "${UPGRADE_HOOK:-}" ] || $P -c "$UPGRADE_HOOK" >/dev/null
if ! $P -1 -f migrations/0009_manager_role.sql >/dev/null 2>&1; then
  [ -n "${UPGRADE_HOOK:-}" ] || { echo 'FAILED: 0009 did not apply'; exit 1; }
  # a failed migration must leave the old state untouched (one transaction)
  $P >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_enum where enumtypid = 'public.app_role'::regtype and enumlabel = 'seller') then raise exception 'FAILED: label seller gone after a failed 0009'; end if;
  if exists (select 1 from pg_enum where enumtypid = 'public.app_role'::regtype and enumlabel = 'manager') then raise exception 'FAILED: label manager left after a failed 0009'; end if;
  if to_regprocedure('public.can_edit_projects()') is not null then raise exception 'FAILED: can_edit_projects left after a failed 0009'; end if;
  if (select source from public.leads where id = '00000000-0000-0000-0000-0000000000f1') <> 'seller' then raise exception 'FAILED: leads.source changed after a failed 0009'; end if;
end $$;
SQL
  echo 'failed 0009 left the old state intact'; exit 0
fi
# stage 2: the old data moved over and the actions work
$P <<'SQL'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false) \gset
do $$ begin
  if exists (select 1 from pg_enum where enumtypid = 'public.app_role'::regtype and enumlabel = 'seller') then raise exception 'FAILED: label seller still exists'; end if;
  if (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000e1') <> 'manager' then raise exception 'FAILED: profile not moved'; end if;
  if (select source from public.leads where id = '00000000-0000-0000-0000-0000000000f1') <> 'manager' then raise exception 'FAILED: lead source not moved'; end if;
  if (select count(*) from public.orders where seller_id = '00000000-0000-0000-0000-0000000000e1') <> 1 then raise exception 'FAILED: order lost'; end if;
  insert into public.leads (created_by, source, contact_name, phone) values ('00000000-0000-0000-0000-0000000000e1', 'seller', 'New', '+43 2');
  if (select assigned_to from public.leads where contact_name = 'New') is distinct from '00000000-0000-0000-0000-0000000000e1' then raise exception 'FAILED: manager lead not self-assigned or old source not converted'; end if;
  set local role authenticated;
  perform public.assign_lead('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1');
  begin  -- the superadmin is no manager: setting a manager role works for him
    perform public.set_user_role('00000000-0000-0000-0000-0000000000e1', 'manager');
  end;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
  begin
    perform public.transfer_lead('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e2', 'x');
    raise exception 'FAILED: transfer to a superadmin was allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'BAD_ASSIGNEE' then raise; end if;  -- expected refusal, and only this one
  end;
end $$;
select 'upgrade checks passed' as result;
SQL
# stage 3: 0010 applies on top of the migrated data; its table and functions exist
$P -1 -f migrations/0010_project_submissions.sql >/dev/null || { echo 'FAILED: 0010 did not apply'; exit 1; }
$P <<'SQL'
do $$ declare f text; begin
  if to_regclass('public.project_private') is null then raise exception 'FAILED: project_private missing after 0010'; end if;
  foreach f in array array['submit_project(uuid,text,boolean)', 'attach_photos(uuid,text[])', 'reject_project(uuid,text,text)', 'unpublish_project(uuid,text)',
      'record_consent(uuid,text,text,boolean,boolean)', 'complete_installation(uuid)', 'notify_managers(text,uuid,text)'] loop
    if to_regprocedure('public.' || f) is null then raise exception 'FAILED: function % missing after 0010', f; end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'projects_consent_guard') then raise exception 'FAILED: consent trigger missing after 0010'; end if;
  if (select count(*) from public.orders) <> 1 then raise exception 'FAILED: order lost by 0010'; end if;
end $$;
select 'migration 0010 applied' as result;
SQL
$P -c 'truncate public.leads, public.profiles, public.lead_events, public.notifications cascade; delete from auth.users' >/dev/null
$P -f test/access.sql
