-- People connected to a lead besides the client: a foreman, an installer, whoever is on site, the architect.
-- They are read with the lead and changed by whoever may edit the lead (can_edit_lead, 0012).
-- No role names in this file.

create table public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  role text check (length(role) <= 60),
  phone text check (length(phone) <= 40),
  email text check (length(email) <= 254),
  note text check (length(note) <= 1000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index lead_contacts_lead on public.lead_contacts (lead_id);

alter table public.lead_contacts enable row level security;
-- readable exactly where the lead is readable (the subquery runs under the caller's rights on leads)
create policy lead_contacts_read on public.lead_contacts for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy lead_contacts_insert on public.lead_contacts for insert to authenticated
  with check (public.can_edit_lead(lead_id));
create policy lead_contacts_update on public.lead_contacts for update to authenticated
  using (public.can_edit_lead(lead_id)) with check (public.can_edit_lead(lead_id));
create policy lead_contacts_delete on public.lead_contacts for delete to authenticated
  using (public.can_edit_lead(lead_id));
revoke all on public.lead_contacts from anon, authenticated;
grant select on public.lead_contacts to authenticated;
grant insert (lead_id, name, role, phone, email, note), update (name, role, phone, email, note), delete on public.lead_contacts to authenticated;
