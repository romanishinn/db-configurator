-- Roles, leads (CRM), quotes and notifications for the configurator.
-- Target: Supabase Postgres (schema "auth" with auth.users and auth.uid() is provided by Supabase).
-- The site stays a static page; every rule about who sees what lives here (row level security),
-- so a user cannot read other people's data even with the public key and the browser console.
-- Never store purchase prices, dealer discounts from the manufacturer or margins here (CLAUDE.md).

-- ---------- types ----------
create type public.app_role as enum ('client', 'seller', 'dealer', 'superdealer', 'superadmin');
create type public.lead_stage as enum (
  'new',          -- Новый
  'contacted',    -- Связался
  'visit_agreed', -- Договорились о выезде
  'consultation', -- Консультация
  'measured',     -- Замер
  'quote_issued', -- КП выдано
  'negotiation',  -- Предложение / переговоры
  'won',          -- Заказ (стал клиентом)
  'lost'          -- Отказ (причина обязательна)
);

-- ---------- organizations: D&B itself and the dealers (brand and company data for their PDF) ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'dealer' check (kind in ('db', 'dealer')),
  city text,
  logo_url text,
  company jsonb not null default '{}'::jsonb, -- address, phone, e-mail, web, VAT id … as shown in the quote header
  created_at timestamptz not null default now()
);

-- ---------- profiles: one per login; role and discount limit are set by the superadmin ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'client',
  org_id uuid references public.organizations (id) on delete set null,
  full_name text,
  phone text,
  email text,
  discount_limit numeric(5, 2) not null default 0 check (discount_limit between 0 and 100), -- % off the catalogue price
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- helpers (security definer: they read profiles without recursing into its own policies)
create function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;
create function public.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid() and active
$$;
create function public.org_of(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = p_user
$$;
create function public.sees_all() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('superadmin', 'superdealer'), false)
$$;
create function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'superadmin', false)
$$;

-- every new login gets a client profile; staff roles are given by the superadmin (or "seller" by a superdealer)
create function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'phone');
  return new;
end $$;
create trigger auth_user_created after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- ---------- leads: one request / one customer object, until it becomes an order ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null, -- null = request from the public site
  source text not null default 'web' check (source in ('web', 'client', 'dealer', 'seller', 'office')),
  utm jsonb not null default '{}'::jsonb,       -- marketing source (utm_*, fbclid / gclid, referrer)
  journey text,                                 -- "how I used the configurator" block of the request
  contact_name text,
  phone text,
  email text,
  object_address text,                          -- with the phone: how a customer is matched to a lead
  postcode text,                                -- for distributing leads by area
  note text,                                    -- the customer's message and wishes (mount, visit) from the form
  assigned_to uuid references public.profiles (id) on delete set null, -- the company comes from the assignee's profile
  stage public.lead_stage not null default 'new',
  next_action_at date,
  lost_reason text,
  last_activity_at timestamptz not null default now(),
  constraint lost_needs_reason check (stage <> 'lost' or length(btrim(coalesce(lost_reason, ''))) > 0)
);
create index leads_assigned_to on public.leads (assigned_to);
create index leads_phone on public.leads (phone);
create index leads_last_activity on public.leads (last_activity_at);

-- ---------- quotes: a frozen calculation (price fixed for 14 days) ----------
create table public.quote_counters (day date primary key, n integer not null);

-- DDMMYY-N, N counts per day for everybody (server side, so it is unique across all devices)
create function public.next_quote_no() returns text
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Europe/Vienna')::date; k integer;
begin
  insert into public.quote_counters as c (day, n) values (d, 1)
  on conflict (day) do update set n = c.n + 1
  returning n into k;
  return to_char(d, 'DDMMYY') || '-' || k;
end $$;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,  -- set by quotes_guard: DDMMYY-N
  lead_id uuid references public.leads (id) on delete set null,
  owner uuid references public.profiles (id) on delete cascade, -- null = request from the public site; company = owner's org
  created_at timestamptz not null default now(),
  valid_until date not null default ((now() at time zone 'Europe/Vienna')::date + 14),
  catalog text not null,          -- price list version the numbers come from, e.g. catalog-2026-07
  config jsonb not null,          -- the configuration as in the share link (incl. Montage / text positions): enough to recompute
  lines jsonb not null default '[]'::jsonb, -- priced lines as shown: the frozen price the office guarantees
  discount jsonb not null default '{}'::jsonb, -- {pergola: %, sides: %, extras: %}
  total_net numeric(12, 2) not null check (total_net >= 0)    -- gross = net × (1 + VAT), not stored
);
create index quotes_owner on public.quotes (owner);
create index quotes_lead on public.quotes (lead_id);

-- ---------- history and in-app notifications ----------
create table public.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  at timestamptz not null default now(),
  by uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('created', 'assigned', 'transferred', 'stage', 'comment', 'quote')),
  from_stage public.lead_stage,
  to_stage public.lead_stage,
  to_user uuid references public.profiles (id) on delete set null,
  comment text
);
create index lead_events_lead on public.lead_events (lead_id, at);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  lead_id uuid references public.leads (id) on delete cascade,
  text text not null,
  read boolean not null default false
);
create index notifications_user on public.notifications (user_id, read, at desc);

create function public.notify_superadmins(p_kind text, p_lead uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, lead_id, text)
  select id, p_kind, p_lead, p_text from public.profiles where role = 'superadmin' and active
$$;

-- ---------- rules on quotes: number, limit for clients, discount within the personal limit ----------
create function public.quotes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_role; lim numeric; d jsonb; k text;
begin
  if tg_op = 'INSERT' then
    new.number := public.next_quote_no();           -- never taken from the browser
    new.created_at := now();
    new.valid_until := (now() at time zone 'Europe/Vienna')::date + 14;
  end if;
  if new.owner is null then return new; end if;     -- public request (inserted by submit_request)
  select role, discount_limit into r, lim from public.profiles where id = new.owner;
  if tg_op = 'INSERT' and r = 'client'
     and (select count(*) from public.quotes where owner = new.owner) >= 3 then
    raise exception 'QUOTE_LIMIT: a client can keep at most 3 calculations' using errcode = 'P0001';
  end if;
  d := coalesce(new.discount, '{}'::jsonb);
  for k in select jsonb_object_keys(d) loop
    if k not in ('pergola', 'sides', 'extras') then
      raise exception 'DISCOUNT_SCOPE: discount only on pergola, sides (constructions) and text positions' using errcode = 'P0001';
    end if;
    if (d ->> k)::numeric < 0 or ((d ->> k)::numeric > lim and r <> 'superadmin') then
      raise exception 'DISCOUNT_LIMIT: % %% is above the personal limit of % %%', d ->> k, lim using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;
create trigger quotes_guard before insert or update on public.quotes
  for each row execute function public.quotes_guard();

-- a quote added to a lead counts as activity on it
create function public.quotes_touch_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null then
    update public.leads set last_activity_at = now() where id = new.lead_id;
    insert into public.lead_events (lead_id, by, kind, comment) values (new.lead_id, new.owner, 'quote', new.number);
  end if;
  return new;
end $$;
create trigger quotes_touch_lead after insert on public.quotes
  for each row execute function public.quotes_touch_lead();

-- ---------- leads: activity, history and notifications ----------
-- a lead entered by a seller or dealer is his own from the start
create function public.leads_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null and new.assigned_to is null
     and (select role from public.profiles where id = new.created_by) in ('seller', 'dealer') then
    new.assigned_to := new.created_by;
  end if;
  return new;
end $$;
create trigger leads_before_insert before insert on public.leads
  for each row execute function public.leads_before_insert();

create function public.leads_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lead_events (lead_id, by, kind, to_stage) values (new.id, new.created_by, 'created', new.stage);
  perform public.notify_superadmins('lead_new', new.id,
    'Новая заявка: ' || coalesce(new.contact_name, '—') || coalesce(' · ' || new.postcode, ''));
  return new;
end $$;
create trigger leads_after_insert after insert on public.leads
  for each row execute function public.leads_after_insert();

create function public.leads_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.last_activity_at := now();
  if new.stage is distinct from old.stage then
    insert into public.lead_events (lead_id, by, kind, from_stage, to_stage, comment)
    values (new.id, auth.uid(), 'stage', old.stage, new.stage, case when new.stage = 'lost' then new.lost_reason end);
  end if;
  return new;
end $$;
create trigger leads_before_update before update on public.leads
  for each row execute function public.leads_before_update();

-- ---------- actions that need more than plain row access ----------

-- superadmin / superdealer: give a lead to a dealer or a seller
create function public.assign_lead(p_lead uuid, p_to uuid, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare to_role public.app_role;
begin
  if not public.sees_all() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select role into to_role from public.profiles where id = p_to and active;
  if to_role is null or to_role not in ('seller', 'dealer', 'superdealer', 'superadmin') then
    raise exception 'BAD_ASSIGNEE' using errcode = 'P0001';
  end if;
  update public.leads set assigned_to = p_to where id = p_lead;
  if not found then raise exception 'NO_LEAD' using errcode = 'P0001'; end if;
  insert into public.lead_events (lead_id, by, kind, to_user, comment) values (p_lead, auth.uid(), 'assigned', p_to, p_comment);
  insert into public.notifications (user_id, kind, lead_id, text) values (p_to, 'lead_assigned', p_lead, 'Вам передан лид' || coalesce(': ' || p_comment, ''));
end $$;

-- the responsible seller passes a lead on to a dealer; the comment is required
create function public.transfer_lead(p_lead uuid, p_to uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare to_role public.app_role;
begin
  if length(btrim(coalesce(p_comment, ''))) = 0 then raise exception 'COMMENT_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.leads where id = p_lead and (assigned_to = auth.uid() or public.sees_all())) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select role into to_role from public.profiles where id = p_to and active;
  if to_role is null or to_role not in ('seller', 'dealer') then raise exception 'BAD_ASSIGNEE' using errcode = 'P0001'; end if;
  update public.leads set assigned_to = p_to where id = p_lead;
  insert into public.lead_events (lead_id, by, kind, to_user, comment) values (p_lead, auth.uid(), 'transferred', p_to, p_comment);
  insert into public.notifications (user_id, kind, lead_id, text) values (p_to, 'lead_assigned', p_lead, 'Вам передан лид: ' || p_comment);
  perform public.notify_superadmins('lead_transferred', p_lead, 'Лид передан дальше: ' || p_comment);
end $$;

-- a comment in the lead history (counts as activity)
create function public.comment_lead(p_lead uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(btrim(coalesce(p_comment, ''))) = 0 then raise exception 'COMMENT_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.leads where id = p_lead
                 and (public.sees_all() or assigned_to = auth.uid() or created_by = auth.uid()
                      or (public.my_role() = 'dealer' and public.org_of(assigned_to) = public.my_org()))) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.leads set last_activity_at = now() where id = p_lead;
  insert into public.lead_events (lead_id, by, kind, comment) values (p_lead, auth.uid(), 'comment', p_comment);
end $$;

-- superadmin: role, organisation, discount limit; superdealer: may only make someone a seller (or back to client)
create function public.set_user_role(p_user uuid, p_role public.app_role, p_org uuid default null, p_discount numeric default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.is_superadmin() then
    update public.profiles set role = p_role, org_id = coalesce(p_org, org_id), discount_limit = coalesce(p_discount, discount_limit) where id = p_user;
  elsif public.my_role() = 'superdealer' and p_role in ('seller', 'client') and p_discount is null
        and (select role from public.profiles where id = p_user) in ('client', 'seller') then
    update public.profiles set role = p_role where id = p_user;
  else
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end $$;

-- the public site: a customer sends a request (no login). Creates the lead and its quote, returns the quote number.
-- ASSUMPTION: no captcha yet; a simple limit of 5 requests per phone / e-mail per day against spam.
create function public.submit_request(p_contact jsonb, p_quote jsonb, p_utm jsonb default '{}'::jsonb, p_journey text default null) returns text
language plpgsql security definer set search_path = public as $$
declare l uuid; num text; ph text := nullif(btrim(p_contact ->> 'phone'), ''); em text := nullif(lower(btrim(p_contact ->> 'email')), '');
begin
  if coalesce(ph, em) is null then raise exception 'CONTACT_REQUIRED' using errcode = 'P0001'; end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 day' and (phone = ph or lower(email) = em)) >= 5 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = 'P0001';
  end if;
  insert into public.leads (source, utm, journey, contact_name, phone, email, object_address, postcode, note, created_by)
  values ('web', coalesce(p_utm, '{}'::jsonb), p_journey, p_contact ->> 'name', ph, em, p_contact ->> 'address', p_contact ->> 'postcode',
          p_contact ->> 'note', auth.uid())
  returning id into l;
  insert into public.quotes (lead_id, owner, catalog, config, lines, total_net)
  values (l, null, p_quote ->> 'catalog', p_quote -> 'config', coalesce(p_quote -> 'lines', '[]'::jsonb), (p_quote ->> 'total_net')::numeric)
  returning number into num;
  return num;
end $$;

-- ---------- the superadmin's board: one row per lead, with the 7-day "no movement" flag ----------
create view public.lead_board with (security_invoker = true) as
select l.*,
       p.full_name as assignee_name, p.role as assignee_role, o.name as assignee_org,
       (l.stage not in ('won', 'lost') and l.last_activity_at < now() - interval '7 days') as stale,
       q.number as last_quote, q.total_net as last_total_net
from public.leads l
left join public.profiles p on p.id = l.assigned_to
left join public.organizations o on o.id = p.org_id
left join lateral (select number, total_net from public.quotes where lead_id = l.id order by created_at desc limit 1) q on true;

-- ---------- row level security ----------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.quotes enable row level security;
alter table public.lead_events enable row level security;
alter table public.notifications enable row level security;
alter table public.quote_counters enable row level security; -- nobody reads it directly

-- organizations: everybody logged in reads them (names for lists); own dealer updates brand; superadmin manages
create policy org_read on public.organizations for select to authenticated using (true);
create policy org_admin on public.organizations for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy org_brand on public.organizations for update to authenticated
  using (id = public.my_org() and public.my_role() = 'dealer') with check (id = public.my_org());

-- profiles: own row; superadmin / superdealer all; staff see the staff list (to pick whom to pass a lead)
create policy profile_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profile_all on public.profiles for select to authenticated using (public.sees_all());
create policy profile_staff on public.profiles for select to authenticated
  using (public.my_role() in ('seller', 'dealer') and role in ('seller', 'dealer', 'superdealer', 'superadmin'));
create policy profile_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- leads: who sees what
--   superadmin / superdealer: all
--   seller: what he entered himself and what was passed to him
--   dealer: the same, plus the leads given to his company
--   client: his own
create policy lead_read on public.leads for select to authenticated using (
  public.sees_all()
  or created_by = auth.uid()
  or assigned_to = auth.uid()
  or (public.my_role() = 'dealer' and public.my_org() is not null and public.org_of(assigned_to) = public.my_org())
);
create policy lead_insert on public.leads for insert to authenticated with check (
  created_by = auth.uid() and public.my_role() in ('seller', 'dealer', 'superdealer', 'superadmin')
);
create policy lead_update on public.leads for update to authenticated using (
  public.sees_all()
  or assigned_to = auth.uid()
  or (created_by = auth.uid() and public.my_role() in ('seller', 'dealer'))
  or (public.my_role() = 'dealer' and public.my_org() is not null and public.org_of(assigned_to) = public.my_org())
);

-- quotes: own; of visible leads; all for superadmin / superdealer
create policy quote_read on public.quotes for select to authenticated using (
  public.sees_all() or owner = auth.uid()
  or (lead_id is not null and exists (select 1 from public.leads l where l.id = lead_id))  -- lead_read decides
);
create policy quote_insert on public.quotes for insert to authenticated with check (owner = auth.uid());
create policy quote_delete_client on public.quotes for delete to authenticated using (owner = auth.uid() and public.my_role() = 'client');
create policy quote_link_lead on public.quotes for update to authenticated using (owner = auth.uid() or public.sees_all());

create policy event_read on public.lead_events for select to authenticated using (
  exists (select 1 from public.leads l where l.id = lead_id)
);
create policy notif_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_read_flag on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- privileges: columns that only the actions above may change ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.organizations, public.profiles, public.leads, public.quotes, public.lead_events, public.notifications, public.lead_board to authenticated;
grant insert, update, delete on public.organizations to authenticated;  -- policies limit it to the superadmin / own brand
grant update (full_name, phone) on public.profiles to authenticated;     -- role, org and limit only via set_user_role
grant insert (created_by, source, utm, contact_name, phone, email, object_address, postcode, note, next_action_at)
  on public.leads to authenticated;
grant update (contact_name, phone, email, object_address, postcode, note, stage, next_action_at, lost_reason)
  on public.leads to authenticated;                                      -- assignment only via assign_lead / transfer_lead
grant insert (lead_id, owner, catalog, config, lines, discount, total_net) on public.quotes to authenticated;
grant update (lead_id) on public.quotes to authenticated;               -- prices stay frozen; a change is a new quote
grant delete on public.quotes to authenticated;
grant update (read) on public.notifications to authenticated;

grant execute on function public.my_role(), public.my_org(), public.org_of(uuid), public.sees_all(), public.is_superadmin() to authenticated;
grant execute on function public.assign_lead(uuid, uuid, text), public.transfer_lead(uuid, uuid, text), public.comment_lead(uuid, text),
  public.set_user_role(uuid, public.app_role, uuid, numeric) to authenticated;
grant execute on function public.submit_request(jsonb, jsonb, jsonb, text) to anon, authenticated;
