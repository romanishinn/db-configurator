-- Partner onboarding: public access requests + superadmin-issued invite links.
-- Flow: a prospect submits an access request (company/name/location/email) → the superadmin
-- reviews and generates an invite link (role + discount group) → the invitee opens the link,
-- fills email/name/location and sets their OWN password → account is created with that role.

-- ---------- access requests (public submit, superadmin reviews) ----------
create table if not exists public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  company     text not null,
  first_name  text not null,
  last_name   text not null,
  location    text not null,
  email       text not null,
  note        text,
  status      text not null default 'new' check (status in ('new', 'invited', 'declined')),
  created_at  timestamptz not null default now()
);
alter table public.access_requests enable row level security;

-- anyone may submit a request (low-risk; the superadmin reviews before granting access)
drop policy if exists ar_insert on public.access_requests;
create policy ar_insert on public.access_requests for insert with check (true);
-- only the superadmin sees and manages them
drop policy if exists ar_admin on public.access_requests;
create policy ar_admin on public.access_requests for all using (public.is_superadmin()) with check (public.is_superadmin());

grant insert (company, first_name, last_name, location, email, note) on public.access_requests to anon, authenticated;
grant select, update, delete on public.access_requests to authenticated;

-- ---------- invites (superadmin issues, accept flow consumes server-side) ----------
create table if not exists public.invites (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique default replace(gen_random_uuid()::text, '-', ''),
  role              public.app_role not null check (role in ('dealer', 'architect')),
  discount_group_id uuid references public.discount_groups(id),
  org_id            uuid references public.organizations(id),
  email             text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '14 days',
  used_at           timestamptz,
  used_by           uuid references public.profiles(id)
);
alter table public.invites enable row level security;

-- only the superadmin manages invites from the app; the public accept flow validates the token
-- server-side in the accept-invite Edge Function (service_role), so there is no public read policy.
drop policy if exists inv_admin on public.invites;
create policy inv_admin on public.invites for all using (public.is_superadmin()) with check (public.is_superadmin());

grant select, insert, update, delete on public.invites to authenticated;
