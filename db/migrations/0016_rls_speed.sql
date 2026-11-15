-- Speed of the access rules on large tables (load test on 100 000 leads, 250 000 quotes, 1 500 000 events):
-- the policies called STABLE helper functions once PER ROW (hundreds of thousands of calls for one board); wrapped in
-- (select ...) Postgres evaluates them once per statement. Opening the CRM went from 4-17 s to 5-130 ms, notifications
-- from 1.3 s to 0.2 ms. Same rules, same results; no role names are spelled here (the policies are rewritten as they are).

-- A. the dealer's company check becomes one array of the company's people instead of org_of(assigned_to) per row
create or replace function public.my_org_users() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}') from public.profiles p
  where public.my_role() = 'dealer' and p.org_id = public.my_org()
$$;
revoke all on function public.my_org_users() from public, anon;
grant execute on function public.my_org_users() to authenticated;

-- every policy of the public tables: helpers evaluated once per statement. Idempotent. (Storage policies are left alone:
-- they run only on file operations, and altering them needs rights the migration role may not have.)
do $$
declare p record; q text; c text;
  dealer_old constant text := '((my_role() = ''dealer''::app_role) AND (my_org() IS NOT NULL) AND (org_of(assigned_to) = my_org()))';
  helpers constant text := '(?<!SELECT )\m(auth\.uid|sees_all|my_role|my_org|is_superadmin|can_edit_projects)\(\)';
begin
  perform set_config('search_path', 'public', true);
  for p in select pol.polname, pol.polrelid::regclass::text as tbl,
                  pg_get_expr(pol.polqual, pol.polrelid) as q, pg_get_expr(pol.polwithcheck, pol.polrelid) as c
           from pg_policy pol join pg_class r on r.oid = pol.polrelid join pg_namespace n on n.oid = r.relnamespace
           where n.nspname = 'public' loop
    q := p.q; c := p.c;
    q := replace(q, dealer_old, '(assigned_to = ANY ((SELECT my_org_users())::uuid[]))');
    c := replace(c, dealer_old, '(assigned_to = ANY ((SELECT my_org_users())::uuid[]))');
    q := regexp_replace(q, helpers, '(SELECT \1())', 'g');
    c := regexp_replace(c, helpers, '(SELECT \1())', 'g');
    if q is distinct from p.q then execute format('alter policy %I on %s using (%s)', p.polname, p.tbl, q); end if;
    if c is distinct from p.c then execute format('alter policy %I on %s with check (%s)', p.polname, p.tbl, c); end if;
  end loop;
end $$;

-- B. indexes in the order the lists are read; an old index that became a prefix of a new one is replaced, not kept
create index if not exists quotes_created on public.quotes (created_at desc);
create index if not exists quotes_lead_created on public.quotes (lead_id, created_at desc);
drop index if exists public.quotes_lead;
create index if not exists quotes_owner_created on public.quotes (owner, created_at desc);
drop index if exists public.quotes_owner;
create index if not exists notifications_user_at on public.notifications (user_id, at desc);
drop index if exists public.notifications_user;
create index if not exists notifications_unread on public.notifications (user_id) where not read;
drop index if exists public.leads_last_activity;   -- leads_activity (0013) covers it
analyze public.quotes, public.notifications;

-- C. norm_phone as one expression: Postgres inlines it (no function call per row); the result is the same for every input
create or replace function public.norm_phone(p text) returns text
language sql immutable parallel safe as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 9), '')
$$;
reindex index public.leads_phone_norm;
