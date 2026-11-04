-- Role "seller" becomes "manager" (a D&B employee; there will be many). Managers and the superadmin add reference
-- projects to the landing page; only the superadmin deletes them. orders.seller_id is NOT renamed: it is the assigned
-- person on an order, not a role. The discount group "Агенты / продавцы" is not touched.

-- 1. the enum value (policies, profiles.role and the lead_board view follow the rename by themselves)
do $$
declare has_old boolean; has_new boolean;
begin
  select bool_or(enumlabel = 'seller'), bool_or(enumlabel = 'manager') into has_old, has_new
    from pg_enum where enumtypid = 'public.app_role'::regtype;
  if has_old and not coalesce(has_new, false) then
    alter type public.app_role rename value 'seller' to 'manager';
  elsif coalesce(has_new, false) and not coalesce(has_old, false) then
    null; -- already renamed
  else
    raise exception 'app_role has an unexpected set of labels (seller=%, manager=%): fix by hand', has_old, has_new;
  end if;
end $$;

-- 2. string literals inside function bodies do not follow the rename: recreate the last versions (0001; not redefined later)
-- ASSUMPTION: the "seller" -> "manager" conversion of leads.source below is a short compatibility for browser tabs
-- opened before the change.  Remove it in 0010.
create or replace function public.leads_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'seller' then new.source := 'manager'; end if;  -- compatibility, remove in 0010
  if new.created_by is not null and new.assigned_to is null
     and (select role from public.profiles where id = new.created_by) in ('manager', 'dealer') then
    new.assigned_to := new.created_by;
  end if;
  return new;
end $$;

create or replace function public.assign_lead(p_lead uuid, p_to uuid, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare to_role public.app_role;
begin
  if not public.sees_all() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select role into to_role from public.profiles where id = p_to and active;
  if to_role is null or to_role not in ('manager', 'dealer', 'superdealer', 'superadmin') then
    raise exception 'BAD_ASSIGNEE' using errcode = 'P0001';
  end if;
  update public.leads set assigned_to = p_to where id = p_lead;
  if not found then raise exception 'NO_LEAD' using errcode = 'P0001'; end if;
  insert into public.lead_events (lead_id, by, kind, to_user, comment) values (p_lead, auth.uid(), 'assigned', p_to, p_comment);
  insert into public.notifications (user_id, kind, lead_id, text) values (p_to, 'lead_assigned', p_lead, 'Вам передан лид' || coalesce(': ' || p_comment, ''));
end $$;

create or replace function public.transfer_lead(p_lead uuid, p_to uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare to_role public.app_role;
begin
  if length(btrim(coalesce(p_comment, ''))) = 0 then raise exception 'COMMENT_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.leads where id = p_lead and (assigned_to = auth.uid() or public.sees_all())) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select role into to_role from public.profiles where id = p_to and active;
  if to_role is null or to_role not in ('manager', 'dealer') then raise exception 'BAD_ASSIGNEE' using errcode = 'P0001'; end if;
  update public.leads set assigned_to = p_to where id = p_lead;
  insert into public.lead_events (lead_id, by, kind, to_user, comment) values (p_lead, auth.uid(), 'transferred', p_to, p_comment);
  insert into public.notifications (user_id, kind, lead_id, text) values (p_to, 'lead_assigned', p_lead, 'Вам передан лид: ' || p_comment);
  perform public.notify_superadmins('lead_transferred', p_lead, 'Лид передан дальше: ' || p_comment);
end $$;

create or replace function public.set_user_role(p_user uuid, p_role public.app_role, p_org uuid default null, p_discount numeric default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.is_superadmin() then
    update public.profiles set role = p_role, org_id = coalesce(p_org, org_id), discount_limit = coalesce(p_discount, discount_limit) where id = p_user;
  elsif public.my_role() = 'superdealer' and p_role in ('manager', 'client') and p_discount is null
        and (select role from public.profiles where id = p_user) in ('client', 'manager') then
    update public.profiles set role = p_role where id = p_user;
  else
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

-- 3. leads.source
alter table public.leads drop constraint leads_source_check;
update public.leads set source = 'manager' where source = 'seller';
alter table public.leads add constraint leads_source_check check (source in ('web', 'client', 'dealer', 'manager', 'office'));

-- 4. projects and their photos: the superadmin and managers write, only the superadmin deletes
-- ASSUMPTION: a manager may also see drafts (needed for upsert and for editing his own entry); drafts hold no secrets.
-- ASSUMPTION: a manager may change any project, not only his own (no owner column; the team is small).
create function public.can_edit_projects() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('superadmin', 'manager'), false)
$$;
grant execute on function public.can_edit_projects() to authenticated;

drop policy projects_admin on public.projects;
create policy projects_staff_read on public.projects for select to authenticated using (public.can_edit_projects());
create policy projects_staff_insert on public.projects for insert to authenticated with check (public.can_edit_projects());
create policy projects_staff_update on public.projects for update to authenticated
  using (public.can_edit_projects()) with check (public.can_edit_projects());
create policy projects_admin_delete on public.projects for delete to authenticated using (public.is_superadmin());

drop policy project_photos_admin on storage.objects;
create policy project_photos_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'project-photos' and public.can_edit_projects());
create policy project_photos_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-photos' and public.can_edit_projects());
create policy project_photos_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'project-photos' and public.can_edit_projects())
  with check (bucket_id = 'project-photos' and public.can_edit_projects());
create policy project_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-photos' and public.is_superadmin());

-- 5. safety net: no leftover "seller" literal anywhere in the catalogue (a failure rolls the whole migration back)
do $$
declare found text;
begin
  select string_agg(what, E'\n') into found from (
    select 'function ' || p.oid::regprocedure as what from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosrc ~ '\mseller\M' and p.proname <> 'leads_before_insert'
    union all select 'policy ' || polname from pg_policy
      where coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), '') ~ '\mseller\M'
    union all select 'check ' || conrelid::regclass || '.' || conname from pg_constraint
      where contype = 'c' and pg_get_constraintdef(oid) ~ '\mseller\M'
    union all select 'view ' || c.oid::regclass from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v', 'm') and pg_get_viewdef(c.oid) ~ '\mseller\M'
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
    raise exception E'leftover "seller" after the rename in:\n%', found;
  end if;
end $$;
