-- 0018: clean-up after the seller -> manager rename (0009).
-- 1. leads_before_insert loses the short compatibility that turned source 'seller' into 'manager' (0009 promised to remove it);
--    the old value is now refused by leads_source_check. Everything else in the function is unchanged (definition of 0009).
create or replace function public.leads_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null and new.assigned_to is null
     and (select role from public.profiles where id = new.created_by) in ('manager', 'dealer') then
    new.assigned_to := new.created_by;
  end if;
  return new;
end $$;

-- 2. transfer_lead (definition of 0014) without the old role label in the allowed list; nothing else changed.
--    assign_lead (0009) has no old label. Grants stay (create or replace keeps them).
create or replace function public.transfer_lead(p_lead uuid, p_to uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare to_role public.app_role;
begin
  if public.my_role() is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_comment, ''))) = 0 then raise exception 'COMMENT_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.leads where id = p_lead and (assigned_to = auth.uid() or public.sees_all())) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select role into to_role from public.profiles where id = p_to and active;
  if to_role is null or to_role::text not in ('manager', 'dealer') then raise exception 'BAD_ASSIGNEE' using errcode = 'P0001'; end if;
  update public.leads set assigned_to = p_to where id = p_lead;
  insert into public.lead_events (lead_id, by, kind, to_user, comment) values (p_lead, auth.uid(), 'transferred', p_to, p_comment);
  insert into public.notifications (user_id, kind, lead_id, text) values (p_to, 'lead_assigned', p_lead, 'Вам передан лид: ' || p_comment);
  perform public.notify_superadmins('lead_transferred', p_lead, 'Лид передан дальше: ' || p_comment);
end $$;

-- 2b. the discount group "agent" = a dealer in that group; the word "sellers" is obsolete (idempotent)
update public.discount_groups set title = 'Агенты' where code = 'agent' and title = 'Агенты / продавцы';

-- 3. safety net as in 0009, now without the leads_before_insert exception (a failure rolls the whole migration back)
do $$
declare found text;
begin
  select string_agg(what, E'\n') into found from (
    select 'function ' || p.oid::regprocedure as what from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'realtime', 'extensions', 'vault', 'graphql', 'graphql_public', 'pgsodium', 'pgsodium_masks', 'supabase_functions', '_realtime', 'net', 'cron', 'pgbouncer', 'supabase_migrations')
        and p.prokind = 'f' and p.prosrc ~ '\mseller\M'
    union all select 'policy ' || polname from pg_policy
      where coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), '') ~ '\mseller\M'
    union all select 'check ' || conrelid::regclass || '.' || conname from pg_constraint
      where contype = 'c' and pg_get_constraintdef(oid) ~ '\mseller\M'
    union all select 'view ' || c.oid::regclass from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'realtime', 'extensions', 'vault', 'graphql', 'graphql_public', 'pgsodium', 'pgsodium_masks', 'supabase_functions', '_realtime', 'net', 'cron', 'pgbouncer', 'supabase_migrations')
        and c.relkind in ('v', 'm') and pg_get_viewdef(c.oid) ~ '\mseller\M'
    union all select 'default ' || adrelid::regclass || '.' || adnum from pg_attrdef
      where pg_get_expr(adbin, adrelid) ~ '\mseller\M'
    union all select 'trigger ' || tgname from pg_trigger
      where not tgisinternal and pg_get_triggerdef(oid) ~ '\mseller\M'
  ) x;
  if to_regclass('cron.job') is not null then
    execute $q$select concat_ws(E'\n', $1, (select string_agg('cron job ' || jobid, E'\n') from cron.job where command ~ '\mseller\M'))$q$
      into found using found;
  end if;
  if found is not null and found <> '' then
    raise exception E'leftover "seller" after the cleanup in:\n%', found;
  end if;
end $$;
