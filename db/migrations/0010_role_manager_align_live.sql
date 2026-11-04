-- Aligns these migrations with the live database, where the sales role is called "manager" (0001 created it as "seller").
-- On the live database this changes nothing: every definition below is the live one. On a fresh rebuild it makes the
-- schema equal to live. Idempotent.
--
-- Known differences that are NOT reproduced here, because they exist only in the live database and their purpose is
-- not documented: the table public.projects and the function public.can_edit_projects().
-- Behaviour taken over from live: a superdealer can no longer make someone a seller/manager (only the superadmin sets
-- roles; managers register themselves through invites).

do $$
begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'app_role' and t.typnamespace = 'public'::regnamespace and e.enumlabel = 'seller')
     and not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'app_role' and t.typnamespace = 'public'::regnamespace and e.enumlabel = 'manager') then
    alter type public.app_role rename value 'seller' to 'manager';
  end if;
end $$;

-- who entered a lead: the value follows the role
update public.leads set source = 'manager' where source = 'seller';
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check check (source in ('web', 'client', 'dealer', 'manager', 'office'));

create or replace function public.leads_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'seller' then new.source := 'manager'; end if;   -- older clients still send "seller"
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
  -- only the superadmin sets or removes the manager role (managers register themselves)
  elsif public.my_role() = 'superdealer' and p_role = 'client' and p_discount is null
        and (select role from public.profiles where id = p_user) = 'client' then
    update public.profiles set role = p_role where id = p_user;
  else
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

-- policies that name the role
drop policy if exists profile_staff on public.profiles;
create policy profile_staff on public.profiles for select to authenticated
  using (public.my_role() in ('manager', 'dealer') and role in ('manager', 'dealer', 'superdealer', 'superadmin'));

drop policy if exists lead_insert on public.leads;
create policy lead_insert on public.leads for insert to authenticated with check (
  created_by = auth.uid() and public.my_role() in ('manager', 'dealer', 'superdealer', 'superadmin')
);
drop policy if exists lead_update on public.leads;
create policy lead_update on public.leads for update to authenticated using (
  public.sees_all()
  or assigned_to = auth.uid()
  or (created_by = auth.uid() and public.my_role() in ('manager', 'dealer'))
  or (public.my_role() = 'dealer' and public.my_org() is not null and public.org_of(assigned_to) = public.my_org())
);

drop policy if exists order_insert on public.orders;
create policy order_insert on public.orders for insert to authenticated with check (
  public.sees_all() or public.my_role() in ('manager', 'dealer', 'superdealer')
);
drop policy if exists order_update on public.orders;
create policy order_update on public.orders for update to authenticated using (
  public.sees_all() or (public.my_role() in ('manager', 'dealer', 'superdealer', 'architect')
    and exists (select 1 from public.leads l where l.id = orders.lead_id))
);

-- these functions are called by the API only as the actions above; the new ones keep the same rule as 0001
revoke all on function public.assign_lead(uuid, uuid, text), public.transfer_lead(uuid, uuid, text),
  public.set_user_role(uuid, public.app_role, uuid, numeric) from public, anon;
grant execute on function public.assign_lead(uuid, uuid, text), public.transfer_lead(uuid, uuid, text),
  public.set_user_role(uuid, public.app_role, uuid, numeric) to authenticated;
revoke all on function public.leads_before_insert() from public, anon, authenticated;
