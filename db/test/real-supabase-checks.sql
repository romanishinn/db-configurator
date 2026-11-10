-- Checks to run on a REAL Supabase project (the stage project), not on the local stub. Every check raises an exception on a mismatch.
-- Run after all migrations 0001-0017 are applied:   psql "$STAGE_DB_URL" -X -v ON_ERROR_STOP=1 -f db/test/real-supabase-checks.sql
-- It changes nothing that stays: the role scenarios run inside a transaction that is rolled back.
-- Why it exists: the local tests use a stand-in for Supabase (db/test/supabase_stub.sql). This file checks what the stand-in only
-- imitates: default privileges on new functions, the real storage.foldername, the real storage policies and tables.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- 1. nobody but the signed-in users may call the client functions; the helpers are closed for everybody
do $$
declare f text; r text;
begin
  -- client RPCs: authenticated yes, anon no
  foreach f in array array[
    'submit_project(uuid,text,boolean)', 'attach_photos(uuid,text[])', 'reject_project(uuid,text,text)',
    'unpublish_project(uuid,text)', 'record_consent(uuid,text,text,boolean,boolean)', 'complete_installation(uuid)',
    'list_orders_for_installation()', 'list_my_installed_orders()'] loop
    if has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'REAL CHECK FAILED: anon can execute %', f; end if;
    if not has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'REAL CHECK FAILED: authenticated cannot execute %', f; end if;
  end loop;
  -- helpers: closed for anon and authenticated
  foreach f in array array[
    'notify_managers(text,uuid,text)', 'order_installed_by_office(uuid)', 'dealer_can_see_order(uuid)',
    'norm_caption(text)', 'caption_has(text,text)', 'projects_consent_guard()'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, 'public.' || f, 'execute') then raise exception 'REAL CHECK FAILED: % can execute helper %', r, f; end if;
    end loop;
  end loop;
end $$;

-- 2. the real storage.foldername behaves as the stub does for our file names <project id>/<uuid>.jpg
do $$
begin
  if storage.foldername('11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg') <> array['11111111-1111-1111-1111-111111111111'] then
    raise exception 'REAL CHECK FAILED: foldername of <id>/<uuid>.jpg';
  end if;
  if cardinality(storage.foldername('file.jpg')) <> 0 then raise exception 'REAL CHECK FAILED: foldername of a name without folder'; end if;
  if cardinality(storage.foldername('a/b/c.jpg')) <> 2 then raise exception 'REAL CHECK FAILED: foldername of a name with a subfolder'; end if;
end $$;

-- 3. the bucket and the policies on storage.objects: only ours may allow anything for project-photos
do $$
declare n int; extra text;
begin
  if not exists (select 1 from storage.buckets where id = 'project-photos' and public and file_size_limit = 5242880) then
    raise exception 'REAL CHECK FAILED: bucket project-photos is missing, not public, or has a different size limit';
  end if;
  select string_agg(policyname, ', ') into extra from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname not like 'project\_photos\_%' and permissive = 'PERMISSIVE';
  if extra is not null then raise notice 'REAL CHECK NOTE: other permissive policies on storage.objects (check they do not cover project-photos): %', extra; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'project\_photos\_%';
  if n < 5 then raise exception 'REAL CHECK FAILED: expected our project_photos_* policies, found %', n; end if;
end $$;

-- 4. role scenarios on the real storage.objects and tables, rolled back at the end
begin;
  create temp table _ids on commit drop as select
    gen_random_uuid() as admin_id, gen_random_uuid() as mgr_id, gen_random_uuid() as dealer_id, gen_random_uuid() as other_dealer_id,
    gen_random_uuid() as pub_id, gen_random_uuid() as draft_id;
  grant select on _ids to anon, authenticated;
  insert into auth.users (id, email) select admin_id, 'admin@check.test' from _ids;
  insert into auth.users (id, email) select mgr_id, 'mgr@check.test' from _ids;
  insert into auth.users (id, email) select dealer_id, 'dealer@check.test' from _ids;
  insert into auth.users (id, email) select other_dealer_id, 'other@check.test' from _ids;
  update public.profiles set role = 'superadmin' where id = (select admin_id from _ids);
  update public.profiles set role = 'manager' where id = (select mgr_id from _ids);
  update public.profiles set role = 'dealer' where id in (select dealer_id from _ids union select other_dealer_id from _ids);
  insert into public.projects (id, title, district, country, photos) select pub_id, 'Check published', 'Graz', 'AT', array[pub_id || '/a.jpg'] from _ids;
  insert into public.projects (id, title, district, country) select draft_id, 'Check draft', '', 'AT' from _ids;
  insert into public.project_private (project_id, submitted_by) select draft_id, dealer_id from _ids;
  select set_config('check.pub', pub_id::text, true), set_config('check.draft', draft_id::text, true),
         set_config('check.mgr', mgr_id::text, true), set_config('check.dealer', dealer_id::text, true),
         set_config('check.other', other_dealer_id::text, true), set_config('check.admin', admin_id::text, true) from _ids \gset
  -- publish the first project with consent (as the superadmin, through the function)
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('check.admin'), 'role', 'authenticated')::text, true);
  select public.record_consent(current_setting('check.pub')::uuid, 'call', 'check-v1', false, false);
  update public.projects set published = true where id = current_setting('check.pub')::uuid;
  -- anon: sees the published project with an EMPTY district (no district consent) and no private data
  reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
  do $$ begin
    if (select count(*) from public.projects where id = current_setting('check.pub')::uuid) <> 1 then raise exception 'REAL CHECK FAILED: anon does not see the published project'; end if;
    if (select district from public.projects where id = current_setting('check.pub')::uuid) <> '' then raise exception 'REAL CHECK FAILED: the district is public without consent'; end if;
    if (select count(*) from public.projects where id = current_setting('check.draft')::uuid) <> 0 then raise exception 'REAL CHECK FAILED: anon sees a draft'; end if;
    begin perform 1 from public.project_private limit 1; raise exception 'REAL CHECK FAILED: anon reads project_private';
    exception when insufficient_privilege then null; end;
  end $$;
  -- dealer: uploads only into the folder of his own open request, under a <uuid>.jpg name; never into another folder or a published one
  reset role; set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('check.dealer'), 'role', 'authenticated')::text, true);
  do $$
  declare ok boolean;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('project-photos', current_setting('check.draft') || '/' || gen_random_uuid() || '.jpg', current_setting('check.dealer')::uuid);
    begin
      insert into storage.objects (bucket_id, name, owner) values ('project-photos', current_setting('check.pub') || '/' || gen_random_uuid() || '.jpg', current_setting('check.dealer')::uuid);
      raise exception 'REAL CHECK FAILED: a dealer uploaded into a published project';
    exception when insufficient_privilege or check_violation then null; end;
    begin
      insert into storage.objects (bucket_id, name, owner) values ('project-photos', gen_random_uuid() || '/' || gen_random_uuid() || '.jpg', current_setting('check.dealer')::uuid);
      raise exception 'REAL CHECK FAILED: a dealer uploaded into a foreign folder';
    exception when insufficient_privilege or check_violation then null; end;
  end $$;
  -- another dealer: sees neither the request nor its private row
  reset role; set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('check.other'), 'role', 'authenticated')::text, true);
  do $$ begin
    if (select count(*) from public.project_private where project_id = current_setting('check.draft')::uuid) <> 0 then raise exception 'REAL CHECK FAILED: another dealer sees a foreign request'; end if;
  end $$;
  -- manager: deletes a file of the unpublished project, not of the published one
  reset role; insert into storage.objects (bucket_id, name) values ('project-photos', current_setting('check.pub') || '/keep.jpg');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', current_setting('check.mgr'), 'role', 'authenticated')::text, true);
  do $$
  declare n int;
  begin
    delete from storage.objects where bucket_id = 'project-photos' and name like current_setting('check.pub') || '/keep.jpg';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'REAL CHECK FAILED: a manager deleted a file of a published project'; end if;
    delete from storage.objects where bucket_id = 'project-photos' and name like current_setting('check.draft') || '/%';
    get diagnostics n = row_count;
    if n < 1 then raise exception 'REAL CHECK FAILED: a manager cannot delete a file of an unpublished project (or the dealer upload did not land)'; end if;
  end $$;
rollback;

select 'real supabase checks passed' as result;
