-- Reference projects shown on the public landing page ("pergolas we have already built").
-- The team adds a project from the phone after the installation; the landing reads the published ones.
-- Public data only: the area (never a street address), the options, photos. The owner's contact for a
-- reference call is NOT stored here — the flag only says the owner agreed, the office passes the contact on by phone.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null check (length(btrim(title)) > 0),     -- e.g. "Villa mit Glasdach, Wien 13."
  district text not null check (length(btrim(district)) > 0), -- district / town, not an exact address
  country text not null check (country in ('AT', 'HR')),
  options text[] not null default '{}' check (options <@ array['bioklimatisch', 'glas', 'zip', 'licht', 'heizung']),
  installed_on date,
  photos text[] not null default '{}',                      -- object paths in the bucket project-photos; the first one is the cover
  video_url text,
  reference_available boolean not null default false,       -- the owner agreed to be called as a reference
  published boolean not null default false,
  sort integer not null default 0,                          -- smaller first; ties: newest installation first
  constraint published_needs_photo check (not published or cardinality(photos) > 0)
);
-- ASSUMPTION: title and district are written in German (the landing is German); a Croatian landing needs its own columns or a second row.

alter table public.projects enable row level security;

-- the public landing (anon) sees published projects only; the superadmin sees and manages all of them
create policy projects_public_read on public.projects for select to anon, authenticated using (published);
-- ASSUMPTION: only the superadmin adds projects; widen the policy (e.g. to superdealer) if the installers' lead should do it
create policy projects_admin on public.projects for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;  -- the policy above limits it to the superadmin

-- ---------- photos: a public bucket (served by URL), written only by the superadmin ----------
-- The page stores the object paths (uuid file names, so unpublished photos cannot be guessed);
-- there is no select policy for the public, so the bucket cannot be listed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-photos', 'project-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy project_photos_admin on storage.objects for all to authenticated
  using (bucket_id = 'project-photos' and public.is_superadmin())
  with check (bucket_id = 'project-photos' and public.is_superadmin());
