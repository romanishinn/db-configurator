-- Sync the repo with schema applied to the live database out-of-band: discount groups, the orders
-- funnel, lead scoring, and the columns/policies they need. Idempotent — a no-op where objects already
-- exist (safe on the live DB) and rebuilds a fresh database to match. Enum values it relies on
-- ('architect', order_stage) come from 0004 and this file's own CREATE TYPE.

-- ---------- order_stage enum (the second funnel) ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'order_stage' and typnamespace = 'public'::regnamespace) then
    create type public.order_stage as enum ('inbox', 'measurement', 'awaiting_payment', 'delivery', 'in_stock', 'installation', 'done');
  end if;
end $$;

-- ---------- discount groups (architect / agent / dealer) ----------
create table if not exists public.discount_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  max_discount numeric(5, 2) not null default 0 check (max_discount >= 0 and max_discount <= 100),
  created_at timestamptz not null default now()
);
insert into public.discount_groups (code, title) values
  ('architect', 'Архитекторы'),
  ('agent', 'Агенты / продавцы'),
  ('dealer', 'Дилеры')
on conflict (code) do nothing;

alter table public.discount_groups enable row level security;
drop policy if exists dg_read on public.discount_groups;
create policy dg_read on public.discount_groups for select to authenticated using (true);
drop policy if exists dg_admin on public.discount_groups;
create policy dg_admin on public.discount_groups for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
grant select on public.discount_groups to authenticated;
grant insert, update, delete on public.discount_groups to authenticated;  -- RLS limits writes to the superadmin

-- ---------- columns the discount/scoring/orders features need ----------
alter table public.organizations add column if not exists currency text not null default 'EUR';
alter table public.organizations add column if not exists country text;
alter table public.organizations add column if not exists discount_group_id uuid references public.discount_groups (id) on delete set null;
alter table public.leads add column if not exists score integer not null default 0;
alter table public.lead_events add column if not exists order_id uuid;
alter table public.lead_events add column if not exists order_from public.order_stage;
alter table public.lead_events add column if not exists order_to public.order_stage;
alter table public.lead_events add column if not exists score_delta integer not null default 0;

-- ---------- orders (created when a lead is won) ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  quote_id uuid references public.quotes (id),
  stage public.order_stage not null default 'inbox',
  seller_id uuid references public.profiles (id),
  measured_at date,
  paid boolean not null default false,
  delivery_eta date,
  stage_due_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists orders_lead on public.orders (lead_id);

alter table public.orders enable row level security;
drop policy if exists order_read on public.orders;
create policy order_read on public.orders for select to authenticated using (
  public.sees_all() or exists (select 1 from public.leads l where l.id = orders.lead_id)
);
drop policy if exists order_insert on public.orders;
create policy order_insert on public.orders for insert to authenticated with check (
  public.sees_all() or public.my_role() in ('seller', 'dealer', 'superdealer')
);
drop policy if exists order_update on public.orders;
create policy order_update on public.orders for update to authenticated using (
  public.sees_all() or (public.my_role() in ('seller', 'dealer', 'superdealer', 'architect')
    and exists (select 1 from public.leads l where l.id = orders.lead_id))
);
grant select on public.orders to authenticated;
grant insert (lead_id, quote_id, seller_id, stage, note) on public.orders to authenticated;
grant update (stage, seller_id, measured_at, paid, delivery_eta, stage_due_at, note) on public.orders to authenticated;

-- ---------- lead scoring: an event carries points; the lead's score accumulates ----------
create or replace function public.lead_events_set_score() returns trigger
language plpgsql as $$
begin
  if new.score_delta = 0 then
    new.score_delta := case new.kind
      when 'quote'       then 10
      when 'stage'       then 5
      when 'comment'     then 2
      when 'assigned'    then 2
      when 'transferred' then 1
      else 0 end;
  end if;
  return new;
end $$;
drop trigger if exists lead_events_set_score on public.lead_events;
create trigger lead_events_set_score before insert on public.lead_events
  for each row execute function public.lead_events_set_score();

create or replace function public.lead_events_apply_score() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null and new.score_delta <> 0 then
    update public.leads set score = score + new.score_delta where id = new.lead_id;
  end if;
  return new;
end $$;
drop trigger if exists lead_events_apply_score on public.lead_events;
create trigger lead_events_apply_score after insert on public.lead_events
  for each row execute function public.lead_events_apply_score();

-- ---------- won lead -> order; order stage changes are logged on the lead ----------
create or replace function public.leads_make_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'won' and (old.stage is distinct from 'won') then
    if not exists (select 1 from public.orders o where o.lead_id = new.id) then
      insert into public.orders (lead_id, seller_id, quote_id)
      values (new.id, new.assigned_to,
              (select id from public.quotes where lead_id = new.id order by created_at desc limit 1));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists leads_make_order on public.leads;
create trigger leads_make_order after update on public.leads
  for each row execute function public.leads_make_order();

create or replace function public.orders_log_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.lead_events (lead_id, order_id, by, kind, order_from, order_to)
    values (new.lead_id, new.id, auth.uid(), 'stage', old.stage, new.stage);
  end if;
  return new;
end $$;
drop trigger if exists orders_log_stage on public.orders;
create trigger orders_log_stage after update on public.orders
  for each row execute function public.orders_log_stage();

-- ---------- fix a recursion the scoring triggers introduce ----------
-- The lead stage-change event must be logged AFTER the update, not inside the BEFORE trigger:
-- otherwise apply_score (AFTER INSERT on lead_events) updates the same lead row while it is still
-- mid-update ("tuple to be updated was already modified"). Moving it to an AFTER trigger fixes the
-- stage change for the live DB too (applied on merge).
create or replace function public.leads_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.last_activity_at := now();
  return new;
end $$;

create or replace function public.leads_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.lead_events (lead_id, by, kind, from_stage, to_stage, comment)
    values (new.id, auth.uid(), 'stage', old.stage, new.stage, case when new.stage = 'lost' then new.lost_reason end);
  end if;
  return new;
end $$;
drop trigger if exists leads_after_update on public.leads;
create trigger leads_after_update after update on public.leads
  for each row execute function public.leads_after_update();
