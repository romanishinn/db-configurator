-- 0020: links of the internal tool (first one: the object gallery, a Google Drive folder).
-- The link itself is NOT in the repository: the superadmin enters it in the interface.
-- Read: logged-in staff and dealers only (manager, superadmin, dealer, superdealer); client and anon see nothing.
-- Write: superadmin only. updated_at / updated_by are set by a trigger, no one can write them directly.
create table public.app_links (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  title text not null check (length(btrim(title)) between 1 and 80),
  url text not null check (url ~ '^https://(drive\.google\.com|docs\.google\.com|photos\.google\.com|photos\.app\.goo\.gl|goo\.gl)/[^[:space:]]*$' and length(url) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
-- ASSUMPTION: updated_by points to profiles (as created_by elsewhere in this project), not to auth.users directly.

create function public.app_links_stamp() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
revoke all on function public.app_links_stamp() from public, anon, authenticated;
create trigger app_links_stamp before insert or update on public.app_links
  for each row execute function public.app_links_stamp();

alter table public.app_links enable row level security;
create policy app_links_read on public.app_links for select to authenticated
  using ((select public.my_role()) in ('manager', 'superadmin', 'dealer', 'superdealer'));
create policy app_links_write on public.app_links for all to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

revoke all on public.app_links from public, anon, authenticated;
grant select on public.app_links to authenticated;
-- update(key) too: the REST upsert (on conflict do update) sets every sent column, the key included; only the superadmin passes the policy anyway
grant insert (key, title, url), update (key, title, url) on public.app_links to authenticated;
grant delete on public.app_links to authenticated;
