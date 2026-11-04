-- Dealer flow for reference projects: a dealer sends the photos of an installed order, the office (manager / superadmin)
-- checks, records the object owner's consent and publishes. Publishing ANY project needs a recorded consent.
-- Status is derived, not stored: published = projects.published; rejected = project_private.rejected_reason is not null;
-- under review = submitted_by is not null and neither of the two. The date of the request = projects.created_at.

-- 1. private side of a project (the public never reads it, so consent and sender are not in projects)
create table public.project_private (
  project_id uuid primary key references public.projects (id) on delete cascade,
  order_id uuid references public.orders (id),                           -- null for projects added by the office
  submitted_by uuid references public.profiles (id) on delete set null,   -- null = the office
  dealer_note text,
  rejected_reason text check (rejected_reason in ('light', 'people', 'plate', 'no_consent', 'no_order', 'wrong_project', 'consent_withdrawn')),
  rejected_note text,
  consent_at timestamptz,
  consent_by uuid references public.profiles (id) on delete set null,
  consent_channel text check (consent_channel in ('call', 'form', 'paper')),
  consent_version text,
  consent_district boolean not null default false                         -- the district may be shown in the caption
);
-- one active project per order: after a rejection for quality the dealer may send again, after a withdrawn consent not
create unique index project_private_one_active_per_order on public.project_private (order_id)
  where order_id is not null and (rejected_reason is null or rejected_reason = 'consent_withdrawn');

alter table public.project_private enable row level security;
create policy project_private_staff_read on public.project_private for select to authenticated using ((select public.can_edit_projects()));
create policy project_private_dealer_read on public.project_private for select to authenticated using (submitted_by = (select auth.uid()));
revoke all on public.project_private from anon, authenticated;
grant select on public.project_private to authenticated;  -- policies decide; written only by the functions below (security definer), never directly

-- 2. projects: a dealer's request starts with empty text; the text is required only to publish
alter table public.projects drop constraint projects_title_check;
alter table public.projects drop constraint projects_district_check;
alter table public.projects add constraint published_needs_text
  check (not published or length(btrim(title)) > 0);  -- the district is optional: it stays public only with the owner's consent

-- publishing needs the owner's consent confirmed by the office (all projects, also those added by the office)
-- ASSUMPTION: a project with a rejection (also a withdrawn consent) cannot be published again; a new project is made instead.
-- Without the consent for the district: published => district is cleared (it is publicly readable), and neither the district
-- nor the postcode of the order may occur in the title (the caption). Synonyms are not caught: the manager answers for the caption.
-- Comparison: lower case, runs of blanks and hyphens = one blank, whole words only, candidates of at least 2 characters.
create function public.norm_caption(t text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(lower(coalesce(t, '')), '[[:space:]-]+', ' ', 'g'))
$$;
create function public.caption_has(p_title text, p_candidate text) returns boolean
language sql immutable set search_path = public as $$
  select length(public.norm_caption(p_candidate)) >= 2
     and public.norm_caption(p_title) ~ ('\m' || regexp_replace(public.norm_caption(p_candidate), '([.\\^$|?*+()\[\]{}])', '\\\1', 'g') || '\M')
$$;
create function public.projects_consent_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_district_ok boolean; v_postcode text;
begin
  if new.published then
    select pp.consent_district, l.postcode into v_district_ok, v_postcode from public.project_private pp
      left join public.orders o on o.id = pp.order_id left join public.leads l on l.id = o.lead_id
     where pp.project_id = new.id and pp.consent_at is not null and pp.rejected_reason is null;
    if not found then raise exception 'CONSENT_REQUIRED' using errcode = 'P0001'; end if;
    if not v_district_ok then
      if public.caption_has(new.title, new.district) or public.caption_has(new.title, v_postcode) then
        raise exception 'DISTRICT_NOT_ALLOWED' using errcode = 'P0001';
      end if;
      new.district := '';
    end if;
  end if;
  return new;
end $$;
create trigger projects_consent_guard before insert or update on public.projects
  for each row execute function public.projects_consent_guard();

-- the dealer sees his own requests, also unpublished ones; he writes nothing (no write policy for him)
create policy projects_dealer_read on public.projects for select to authenticated using (
  exists (select 1 from public.project_private pp where pp.project_id = projects.id and pp.submitted_by = (select auth.uid()))
);

-- 3. notifications for the office (like notify_superadmins)
create function public.notify_managers(p_kind text, p_lead uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, lead_id, text)
  select id, p_kind, p_lead, p_text from public.profiles where role in ('manager', 'superadmin') and active
$$;

-- 4. actions (security definer: row level security does not apply inside, so every rule is checked here)
-- The dealer can set an order to 'done' himself (order_update), so 'installed' counts only when the LAST 'done' event of the
-- order was written by the office. ASSUMPTION (owner: "монтаж подтверждает менеджер"): office = manager or superadmin, NOT superdealer.
create function public.order_installed_by_office(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role::text in ('manager', 'superadmin')
    from public.lead_events e left join public.profiles p on p.id = e.by
   where e.order_id = p_order and e.kind = 'stage' and e.order_to = 'done' order by e.id desc limit 1), false)
$$;

-- The manager does not see all leads; this is his narrow window on orders waiting for "installation completed".
-- needs_confirmation = the stage is already 'done' (set by someone else) but the office has not confirmed it. ASSUMPTION.
create function public.list_orders_for_installation()
returns table (order_id uuid, stage text, contact_name text, postcode text, needs_confirmation boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_edit_projects() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
    select o.id, o.stage::text, l.contact_name, l.postcode, o.stage = 'done'
      from public.orders o join public.leads l on l.id = o.lead_id
     where o.stage <> 'done' or not public.order_installed_by_office(o.id);
end $$;

-- The order is visible to the caller by the same rule as order_read / lead_read (0001, 0005); the caller is a dealer here.
create function public.dealer_can_see_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o join public.leads l on l.id = o.lead_id
   where o.id = p_order
     -- the dealer branch of lead_read (0016): own leads, leads assigned to him, leads of the people of his company.
     -- It must give the same orders as the order_read policy; db/test/access.sql compares the two for every dealer.
     and (l.created_by = auth.uid() or l.assigned_to = auth.uid() or l.assigned_to = any (public.my_org_users())))
$$;

create function public.submit_project(p_order uuid, p_note text, p_assured boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o_stage public.order_stage; o_lead uuid; v_postcode text; v_at timestamptz;
  v_district text; v_id uuid := gen_random_uuid();
begin
  if public.my_role() is distinct from 'dealer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_assured is not true then raise exception 'ASSURANCE_REQUIRED' using errcode = 'P0001'; end if;
  if not public.dealer_can_see_order(p_order) then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  select o.stage, l.id, l.postcode into o_stage, o_lead, v_postcode
    from public.orders o join public.leads l on l.id = o.lead_id where o.id = p_order;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  select e.at into v_at from public.lead_events e
   where e.order_id = p_order and e.kind = 'stage' and e.order_to = 'done' order by e.id desc limit 1;
  if o_stage <> 'done' or v_at is null or not public.order_installed_by_office(p_order) then
    raise exception 'NOT_INSTALLED' using errcode = 'P0001';
  end if;
  -- one active project per order is enforced by the unique index (also under concurrent calls)
  v_district := coalesce(btrim(v_postcode), '');
  -- ASSUMPTION: country AT; the office corrects it. The title is a draft WITHOUT the district (shown only with the owner's consent).
  begin
    insert into public.projects (id, title, district, country, installed_on)
    values (v_id, 'Bioklimatische Pergola, ' || extract(year from v_at at time zone 'Europe/Vienna')::int,
            v_district, 'AT', (v_at at time zone 'Europe/Vienna')::date);
    insert into public.project_private (project_id, order_id, submitted_by, dealer_note)
    values (v_id, p_order, auth.uid(), nullif(btrim(p_note), ''));
  exception when unique_violation then
    raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001';
  end;
  perform public.notify_managers('project_submitted', o_lead, 'Новая заявка проекта от дилера');
  return v_id;
end $$;

-- The dealer's own confirmed orders that can still be sent: no active project (rejected for quality = may be sent again).
create function public.list_my_installed_orders() returns table (order_id uuid, contact_name text, postcode text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'dealer' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
    select o.id, l.contact_name, l.postcode from public.orders o join public.leads l on l.id = o.lead_id
     where public.dealer_can_see_order(o.id) and o.stage = 'done' and public.order_installed_by_office(o.id)
       and not exists (select 1 from public.project_private pp where pp.order_id = o.id
                        and (pp.rejected_reason is null or pp.rejected_reason = 'consent_withdrawn'));
end $$;

create function public.attach_photos(p_project uuid, p_paths text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_photos text[];
begin
  if not exists (select 1 from public.project_private where project_id = p_project and submitted_by = auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select photos into v_photos from public.projects where id = p_project for update;  -- serialises two calls
  if exists (select 1 from public.projects where id = p_project and published)
     or exists (select 1 from public.project_private where project_id = p_project and rejected_reason is not null) then
    raise exception 'PROJECT_LOCKED' using errcode = 'P0001';
  end if;
  if cardinality(v_photos) > 0 then raise exception 'PROJECT_HAS_PHOTOS' using errcode = 'P0001'; end if;  -- the office owns the list afterwards
  if coalesce(cardinality(p_paths), 0) = 0 then raise exception 'TOO_FEW_PHOTOS' using errcode = 'P0001'; end if;
  if cardinality(p_paths) > 12 then raise exception 'TOO_MANY_PHOTOS' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_paths) x where x is null or x !~ ('^' || p_project::text || '/[0-9a-f-]{36}\.jpg$')) then
    raise exception 'BAD_PATH' using errcode = 'P0001';
  end if;
  update public.projects set photos = p_paths where id = p_project;
end $$;

create function public.reject_project(p_project uuid, p_reason text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_dealer uuid; v_lead uuid; v_old text;
begin
  if not public.can_edit_projects() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  -- ASSUMPTION: 'consent_withdrawn' is set only by unpublish_project
  if p_reason is null or p_reason not in ('light', 'people', 'plate', 'no_consent', 'no_order', 'wrong_project') then
    raise exception 'BAD_REASON' using errcode = 'P0001';
  end if;
  select pp.submitted_by, o.lead_id, pp.rejected_reason into v_dealer, v_lead, v_old
    from public.project_private pp left join public.orders o on o.id = pp.order_id where pp.project_id = p_project;
  if not found then raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.projects where id = p_project and published) then raise exception 'PROJECT_PUBLISHED' using errcode = 'P0001'; end if;
  if v_old = 'consent_withdrawn' then raise exception 'CONSENT_WITHDRAWN' using errcode = 'P0001'; end if;
  update public.project_private set rejected_reason = p_reason, rejected_note = p_note where project_id = p_project;
  if v_dealer is not null then
    insert into public.notifications (user_id, kind, lead_id, text)
    values (v_dealer, 'project_rejected', v_lead, 'Проект отклонён: ' || p_reason || coalesce(' · ' || nullif(btrim(p_note), ''), ''));
  end if;
end $$;

create function public.unpublish_project(p_project uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_dealer uuid; v_lead uuid;
begin
  if not public.can_edit_projects() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select pp.submitted_by, o.lead_id into v_dealer, v_lead
    from public.project_private pp left join public.orders o on o.id = pp.order_id where pp.project_id = p_project;
  -- ASSUMPTION: a project added by the office has no private row; it is created here so that the withdrawal is recorded
  if not found then
    if not exists (select 1 from public.projects where id = p_project) then raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001'; end if;
    insert into public.project_private (project_id) values (p_project);
  end if;
  begin
    update public.projects set published = false where id = p_project;
    update public.project_private set rejected_reason = 'consent_withdrawn', rejected_note = p_note where project_id = p_project;
  exception when unique_violation then  -- the dealer has already sent the same order again
    raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001';
  end;
  if v_dealer is not null then
    insert into public.notifications (user_id, kind, lead_id, text)
    values (v_dealer, 'project_unpublished', v_lead, 'Проект снят с публикации (согласие владельца отозвано)');
  end if;
end $$;

create function public.record_consent(p_project uuid, p_channel text, p_version text, p_district boolean, p_reference boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_projects() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.projects where id = p_project) then raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.project_private where project_id = p_project and rejected_reason = 'consent_withdrawn') then
    raise exception 'CONSENT_WITHDRAWN' using errcode = 'P0001';  -- after a withdrawal a new project is made
  end if;
  if length(btrim(coalesce(p_version, ''))) = 0 then raise exception 'VERSION_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.project_private (project_id, consent_at, consent_by, consent_channel, consent_version, consent_district)
  values (p_project, now(), auth.uid(), p_channel, p_version, coalesce(p_district, false))
  on conflict (project_id) do update set consent_at = excluded.consent_at, consent_by = excluded.consent_by,
    consent_channel = excluded.consent_channel, consent_version = excluded.consent_version, consent_district = excluded.consent_district;
  update public.projects set reference_available = coalesce(p_reference, false) where id = p_project;
end $$;

-- The office confirms the installation. Stage not yet 'done': set it (trigger orders_log_stage records auth.uid()).
-- Already 'done' but not by the office (the dealer set it): add a confirming event. Already confirmed: nothing (idempotent).
create function public.complete_installation(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_stage public.order_stage; v_lead uuid;
begin
  if not public.can_edit_projects() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select stage, lead_id into v_stage, v_lead from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_stage <> 'done' then
    update public.orders set stage = 'done' where id = p_order;
  elsif not public.order_installed_by_office(p_order) then
    insert into public.lead_events (lead_id, by, kind, order_id, order_from, order_to, comment)
    values (v_lead, auth.uid(), 'stage', p_order, 'done', 'done', 'installation confirmed by the office');
  end if;
end $$;

revoke all on function public.notify_managers(text, uuid, text), public.projects_consent_guard(), public.order_installed_by_office(uuid),
  public.dealer_can_see_order(uuid), public.norm_caption(text), public.caption_has(text, text) from public, anon, authenticated;
revoke all on function public.submit_project(uuid, text, boolean), public.attach_photos(uuid, text[]), public.reject_project(uuid, text, text),
  public.unpublish_project(uuid, text), public.record_consent(uuid, text, text, boolean, boolean), public.complete_installation(uuid), public.list_orders_for_installation(), public.list_my_installed_orders()
  from public, anon;
grant execute on function public.submit_project(uuid, text, boolean), public.attach_photos(uuid, text[]), public.reject_project(uuid, text, text),
  public.unpublish_project(uuid, text), public.record_consent(uuid, text, text, boolean, boolean), public.complete_installation(uuid), public.list_orders_for_installation(), public.list_my_installed_orders()
  to authenticated;

-- 5. photos: the dealer uploads into the folder of his own open project (<project id>/<uuid>.jpg) and can neither read,
-- change nor delete; the manager also deletes files of unpublished projects (never of published ones)
-- ASSUMPTION: photos of a project live in the folder named by the project id; files elsewhere only the superadmin deletes.
create policy project_photos_dealer_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-photos' and (select public.my_role()) = 'dealer'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and exists (select 1 from public.projects p join public.project_private pp on pp.project_id = p.id
                where p.id::text = (storage.foldername(name))[1] and pp.submitted_by = (select auth.uid())
                  and not p.published and pp.rejected_reason is null)
  );
create policy project_photos_staff_delete_draft on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-photos' and (select public.can_edit_projects())
    and exists (select 1 from public.projects p where p.id::text = (storage.foldername(name))[1] and not p.published)
  );
