-- 0014: access hardening after the security review (done on a local copy) (deactivated users, org columns, org_of, discount groups, API grants).

-- 1. a deactivated login (profiles.active = false) loses all access to CRM data
do $$
declare t text;
begin
  foreach t in array array['leads', 'quotes', 'orders', 'lead_events', 'notifications', 'quote_approvals'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.my_role() is not null) with check (public.my_role() is not null)', t || '_active_only', t);
  end loop;
end $$;

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
  if to_role is null or to_role::text not in ('manager', 'seller', 'dealer') then raise exception 'BAD_ASSIGNEE' using errcode = 'P0001'; end if;
  update public.leads set assigned_to = p_to where id = p_lead;
  insert into public.lead_events (lead_id, by, kind, to_user, comment) values (p_lead, auth.uid(), 'transferred', p_to, p_comment);
  insert into public.notifications (user_id, kind, lead_id, text) values (p_to, 'lead_assigned', p_lead, 'Вам передан лид: ' || p_comment);
  perform public.notify_superadmins('lead_transferred', p_lead, 'Лид передан дальше: ' || p_comment);
end $$;

-- 2. a dealer edits only the brand of his company; kind, currency, discount group are the superadmin's
create function public.organizations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() and (new.kind, new.currency, new.discount_group_id, new.country)
       is distinct from (old.kind, old.currency, old.discount_group_id, old.country) then
    raise exception 'FORBIDDEN: only the superadmin changes kind, currency, country and discount group' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.organizations_guard() from public, anon, authenticated;
create trigger organizations_guard before update on public.organizations
  for each row execute function public.organizations_guard();

-- 3. org_of no longer tells anybody the company of an arbitrary user: it answers only for the caller's own company
--    (the policies compare it with my_org(), so their meaning does not change)
create or replace function public.org_of(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = p_user and org_id = public.my_org()
$$;

-- 4. discount groups (max discount per partner type) are for staff, not for clients
drop policy dg_read on public.discount_groups;
create policy dg_read on public.discount_groups for select to authenticated using (coalesce(public.my_role() <> 'client', false));

-- 5. Supabase gives anon/authenticated ALL on every table and function created later in public (default privileges).
--    Take them back and grant exactly what the migrations meant; new objects start with nothing.
revoke all on public.discount_groups, public.orders, public.pricing_config, public.access_requests, public.invites,
  public.projects, public.quote_approvals, public.customers, public.lead_board from anon, authenticated;
grant select, insert, update, delete on public.discount_groups to authenticated;
grant select on public.orders to authenticated;
grant insert (lead_id, quote_id, seller_id, stage, note) on public.orders to authenticated;
grant update (stage, seller_id, measured_at, paid, delivery_eta, stage_due_at, note) on public.orders to authenticated;
grant select on public.pricing_config to anon, authenticated;
grant update (install_pct, delivery_pct, updated_at) on public.pricing_config to authenticated;
grant insert (company, first_name, last_name, location, email, note) on public.access_requests to anon, authenticated;
grant select, update, delete on public.access_requests to authenticated;
grant select, insert, update, delete on public.invites to authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant select on public.quote_approvals, public.customers, public.lead_board to authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
