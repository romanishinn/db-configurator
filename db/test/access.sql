-- Who sees and may do what. Every check is an assert; the script stops at the first failure.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- act as a logged-in user (as Supabase does: role "authenticated" + the user's id in the JWT) or as the public site
create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('role', 'authenticated', false), set_config('request.jwt.claim.sub', u::text, false) $$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', false), set_config('request.jwt.claim.sub', '', false) $$;
create function pg_temp.as_root() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false) $$;
-- act as the submit-request Edge Function: the server-side role, after it has verified the Turnstile token
create function pg_temp.as_service() returns void language sql as $$
  select set_config('role', 'service_role', false), set_config('request.jwt.claim.sub', '', false) $$;
-- true when the statement fails with an error containing the text
create function pg_temp.fails(stmt text, msg text) returns boolean language plpgsql as $$
begin execute stmt; return false;
exception when others then return position(msg in sqlerrm) > 0 or position(msg in sqlstate) > 0; end $$;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', msg; end if; end $$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- ---------- people ----------
insert into public.organizations (id, name, kind, city) values
  ('00000000-0000-0000-0000-0000000000a1', 'Dealer Graz', 'dealer', 'Graz'),
  ('00000000-0000-0000-0000-0000000000b1', 'Dealer Linz', 'dealer', 'Linz');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@db.test'),
  ('00000000-0000-0000-0000-000000000002', 'superdealer@db.test'),
  ('00000000-0000-0000-0000-000000000003', 'manager@db.test'),
  ('00000000-0000-0000-0000-000000000004', 'graz1@dealer.test'),
  ('00000000-0000-0000-0000-000000000005', 'graz2@dealer.test'),
  ('00000000-0000-0000-0000-000000000006', 'linz@dealer.test'),
  ('00000000-0000-0000-0000-000000000007', 'client@mail.test'),
  ('00000000-0000-0000-0000-000000000008', 'newbie@mail.test');
select pg_temp.check((select count(*) from public.profiles where role = 'client') = 8, 'every login starts as a client');
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set role = 'superdealer' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set role = 'manager', discount_limit = 5 where id = '00000000-0000-0000-0000-000000000003';
update public.profiles set role = 'dealer', discount_limit = 10, org_id = '00000000-0000-0000-0000-0000000000a1' where id in ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005');
update public.profiles set role = 'dealer', discount_limit = 8, org_id = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-000000000006';
\set admin '00000000-0000-0000-0000-000000000001'
\set superdealer '00000000-0000-0000-0000-000000000002'
\set manager '00000000-0000-0000-0000-000000000003'
\set graz1 '00000000-0000-0000-0000-000000000004'
\set graz2 '00000000-0000-0000-0000-000000000005'
\set linz '00000000-0000-0000-0000-000000000006'
\set client '00000000-0000-0000-0000-000000000007'
\set newbie '00000000-0000-0000-0000-000000000008'

-- ---------- 1. the public site sends a request (via the Edge Function): lead + quote with a server number DDMMYY-N ----------
select pg_temp.as_service();
select public.submit_request('{"name":"Maria Huber","phone":"+43 660 1","email":"maria@x.at","address":"Hauptstr. 1, 8010 Graz","postcode":"8010","note":"Montage gewünscht"}',
  '{"catalog":"catalog-2026-07","config":{"width":6600},"lines":[{"t":"S400","a":13891}],"total_net":13891}', '{"utm_source":"facebook"}', 'Erster Besuch') as n1 \gset
select public.submit_request('{"name":"Karl","phone":"+43 660 2"}', '{"catalog":"catalog-2026-07","config":{},"total_net":9000}') as n2 \gset
select pg_temp.check(:'n1' = to_char((now() at time zone 'Europe/Vienna')::date, 'DDMMYY') || '-1', 'first number of the day ends in -1');
select pg_temp.check(:'n2' like '%-2', 'numbers count up for everybody');
select pg_temp.check(pg_temp.fails($q$select public.submit_request('{}', '{"catalog":"c","config":{},"total_net":1}')$q$, 'CONTACT_REQUIRED'), 'a request needs a phone or an e-mail');
-- the public site itself (anon) can neither read leads nor reach the request RPC directly
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($q$select * from public.leads$q$, 'permission denied'), 'the public site cannot read leads');
select pg_temp.check(pg_temp.fails($q$select public.submit_request('{"phone":"+43 1"}', '{"catalog":"c","config":{},"total_net":1}')$q$, 'permission denied'), 'the public site cannot call submit_request directly (bot protection)');

-- ---------- 2. superadmin sees everything and was notified ----------
select pg_temp.as_user(:'admin');
select pg_temp.check((select count(*) from public.leads) = 2, 'superadmin sees all leads');
select pg_temp.check((select count(*) from public.notifications where kind = 'lead_new') = 2, 'superadmin got a notification per request');
select pg_temp.check((select count(*) from public.quotes) = 2, 'superadmin sees all quotes');
select id as lead_maria from public.leads where contact_name = 'Maria Huber' \gset
select id as lead_karl from public.leads where contact_name = 'Karl' \gset

-- ---------- 3. assignment: only the dealer (and his company) sees the lead ----------
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.leads) = 0, 'a dealer sees nothing before assignment');
select pg_temp.fails(format('select public.assign_lead(%L, %L)', :'lead_maria', :'graz1'), 'FORBIDDEN') as ok \gset
select pg_temp.check(:'ok', 'a dealer cannot assign leads');
select pg_temp.as_user(:'admin');
select public.assign_lead(:'lead_maria', :'graz1', 'Graz, bitte anrufen');
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.leads) = 1, 'the assigned dealer sees the lead');
select pg_temp.check((select count(*) from public.quotes) = 1, '… and its quote');
select pg_temp.check((select count(*) from public.notifications where kind = 'lead_assigned') = 1, '… and got a notification');
select pg_temp.as_user(:'graz2');
select pg_temp.check((select count(*) from public.leads) = 1, 'a colleague in the same dealer company sees it too');
select pg_temp.as_user(:'linz');
select pg_temp.check((select count(*) from public.leads) = 0 and (select count(*) from public.quotes) = 0, 'another dealer sees nothing');
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.leads where id <> :'lead_karl') = 0, 'a manager sees nothing that is not his, except new site requests (0012)');

-- ---------- 4. stages: history, required reason for a refusal, assignment cannot be changed directly ----------
select pg_temp.as_user(:'graz1');
update public.leads set stage = 'contacted' where id = :'lead_maria';
select pg_temp.fails(format($q$update public.leads set stage = 'lost' where id = %L$q$, :'lead_maria'), 'lost_needs_reason') as ok \gset
select pg_temp.check(:'ok', 'a refusal needs a reason');
update public.leads set stage = 'lost', lost_reason = 'zu teuer' where id = :'lead_maria';
select pg_temp.fails(format('update public.leads set assigned_to = %L where id = %L', :'graz1', :'lead_karl'), 'permission denied') as ok \gset
select pg_temp.check(:'ok', 'assignment only through assign_lead / transfer_lead');
select pg_temp.check((select count(*) from public.lead_events where kind = 'stage') = 2, 'each stage change is in the history');
select pg_temp.check((select comment from public.lead_events where to_stage = 'lost') = 'zu teuer', 'the reason is in the history');

-- ---------- 5. a manager enters a lead and passes it to a dealer (comment required) ----------
select pg_temp.as_user(:'manager');
insert into public.leads (created_by, source, contact_name, phone) values (:'manager', 'manager', 'Anna', '+43 660 3');
select id as lead_anna from public.leads where contact_name = 'Anna' \gset
select pg_temp.fails(format('select public.transfer_lead(%L, %L, %L)', :'lead_anna', :'linz', ' '), 'COMMENT_REQUIRED') as ok \gset
select pg_temp.check(:'ok', 'passing a lead on needs a comment');
select public.transfer_lead(:'lead_anna', :'linz', 'Kundin will Beratung in Linz');
select pg_temp.as_user(:'linz');
select pg_temp.check((select count(*) from public.leads) = 1, 'the dealer now sees the passed lead');
select pg_temp.as_user(:'superdealer');
select pg_temp.check((select count(*) from public.leads) = 3, 'the superdealer sees everything');

-- ---------- 6. quotes: client limit 3, discounts within the personal limit, prices frozen ----------
select pg_temp.as_user(:'client');
insert into public.quotes (owner, catalog, config, total_net) select :'client', 'catalog-2026-07', '{}', 1000 from generate_series(1, 3);
select pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, total_net) values (%L, 'c', '{}', 1)$q$, :'client'), 'QUOTE_LIMIT') as ok \gset
select pg_temp.check(:'ok', 'a client keeps at most 3 calculations');
delete from public.quotes where id = (select id from public.quotes where owner = :'client' limit 1);
insert into public.quotes (owner, catalog, config, total_net) values (:'client', 'catalog-2026-07', '{}', 1000);
select pg_temp.as_user(:'newbie');
select pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, total_net, discount) values (%L, 'c', '{}', 1, '{"pergola": 1}')$q$, :'newbie'), 'DISCOUNT_LIMIT') as ok \gset
select pg_temp.check(:'ok', 'a client cannot give himself a discount');
select pg_temp.check((select count(*) from public.quotes) = 0, 'a new client sees no quotes of others');
select pg_temp.as_user(:'graz1');
insert into public.quotes (owner, lead_id, catalog, config, total_net, discount) values (:'graz1', :'lead_maria', 'catalog-2026-07', '{}', 12000, '{"pergola": 10, "sides": 5}');
select pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, total_net, discount) values (%L, 'c', '{}', 1, '{"pergola": 12}')$q$, :'graz1'), 'DISCOUNT_LIMIT') as ok1 \gset
select pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, total_net, discount) values (%L, 'c', '{}', 1, '{"options": 5}')$q$, :'graz1'), 'DISCOUNT_SCOPE') as ok2 \gset
select pg_temp.fails($q$update public.quotes set total_net = 1$q$, 'permission denied') as ok3 \gset
select pg_temp.fails(format($q$insert into public.quotes (owner, number, catalog, config, total_net) values (%L, 'X-1', 'c', '{}', 1)$q$, :'graz1'), 'permission denied') as ok4 \gset
select pg_temp.check(:'ok1', 'discount above the personal limit is refused');
select pg_temp.check(:'ok2', 'discount only on pergola, sides and text positions');
select pg_temp.check(:'ok3', 'prices of a saved quote cannot be changed');
select pg_temp.check(:'ok4', 'the quote number never comes from the browser');
select pg_temp.check((select valid_until from public.quotes where owner = :'graz1') = (now() at time zone 'Europe/Vienna')::date + 14, 'price valid 14 days');
select pg_temp.as_user(:'linz');
select pg_temp.check((select count(*) from public.quotes where owner = :'graz1') = 0, 'a dealer never sees another dealer''s quotes');

-- ---------- 7. roles: the manager role is set by the superadmin only ----------
select pg_temp.as_user(:'superdealer');
select pg_temp.fails(format($q$select public.set_user_role(%L, 'manager')$q$, :'newbie'), 'FORBIDDEN') as ok0 \gset
select pg_temp.fails(format($q$select public.set_user_role(%L, 'dealer')$q$, :'newbie'), 'FORBIDDEN') as ok1 \gset
select pg_temp.fails(format($q$select public.set_user_role(%L, 'manager', null, 50)$q$, :'newbie'), 'FORBIDDEN') as ok2 \gset
select pg_temp.as_user(:'graz1');
select pg_temp.fails(format($q$select public.set_user_role(%L, 'superadmin')$q$, :'graz1'), 'FORBIDDEN') as ok3 \gset
select pg_temp.fails(format($q$update public.profiles set discount_limit = 100 where id = %L$q$, :'graz1'), 'permission denied') as ok4 \gset
select pg_temp.check(:'ok0' and :'ok1' and :'ok2', 'a superdealer can make neither managers nor dealers nor discount limits');
select pg_temp.check(:'ok3' and :'ok4', 'nobody raises his own role or limit');

-- ---------- 8. the board: 7 days without movement are flagged ----------
select pg_temp.as_root();
alter table public.leads disable trigger leads_before_update; -- simulate a week of silence
update public.leads set last_activity_at = now() - interval '8 days' where id = :'lead_karl';
alter table public.leads enable trigger leads_before_update;
select pg_temp.as_user(:'admin');
select pg_temp.check((select stale from public.lead_board where id = :'lead_karl'), 'a lead without movement for 7 days is flagged');
select pg_temp.check(not (select stale from public.lead_board where id = :'lead_maria'), 'a closed lead is not flagged');
select pg_temp.check((select assignee_org from public.lead_board where id = :'lead_anna') = 'Dealer Linz', 'the board shows the company of the assignee');

-- ---------- 9. bot protection: the public lead write is closed to the browser roles ----------
-- (0002) a non-logged-in visitor must not be able to call submit_request directly; only the
-- Edge Function (service_role), after a Turnstile check, may create a lead from the web.
select pg_temp.check(not has_function_privilege('anon',          'public.submit_request(jsonb,jsonb,jsonb,text)', 'execute'), 'anon cannot call submit_request directly');
select pg_temp.check(not has_function_privilege('authenticated', 'public.submit_request(jsonb,jsonb,jsonb,text)', 'execute'), 'a logged-in user cannot call submit_request directly');
select pg_temp.check(    has_function_privilege('service_role',  'public.submit_request(jsonb,jsonb,jsonb,text)', 'execute'), 'the Edge Function (service_role) may call submit_request');

-- ---------- 10. quote revisions: a correction keeps the base number and adds a version (0003) ----------
select pg_temp.as_user(:'graz1');  -- the dealer the Maria lead was assigned to
insert into public.quotes (lead_id, owner, catalog, config, lines, total_net)
  values (:'lead_maria', :'graz1', 'c', '{}'::jsonb, '[]'::jsonb, 1000) returning id as qbase_id, number as qbase_no \gset
insert into public.quotes (lead_id, owner, catalog, config, lines, total_net, revises)
  values (:'lead_maria', :'graz1', 'c', '{}'::jsonb, '[]'::jsonb, 1100, :'qbase_id') returning id as qrev2_id, number as qrev2 \gset
insert into public.quotes (lead_id, owner, catalog, config, lines, total_net, revises)
  values (:'lead_maria', :'graz1', 'c', '{}'::jsonb, '[]'::jsonb, 1200, :'qbase_id') returning number as qrev3 \gset
select pg_temp.check(:'qrev2' = :'qbase_no' || '.2', 'first correction is <base>.2');
select pg_temp.check(:'qrev3' = :'qbase_no' || '.3', 'second correction is <base>.3');
-- correcting a revision stays in the same family, counting from the base
insert into public.quotes (lead_id, owner, catalog, config, lines, total_net, revises)
  values (:'lead_maria', :'graz1', 'c', '{}'::jsonb, '[]'::jsonb, 1300, :'qrev2_id') returning number as qrev4 \gset
select pg_temp.check(:'qrev4' = :'qbase_no' || '.4', 'correcting a revision still extends the base family (.4)');
select pg_temp.check((select count(*) from public.quotes where number = :'qbase_no' or number like :'qbase_no' || '.%') = 4, 'the family holds the base and its three revisions');

-- ---------- 11. pricing config: everyone reads, only superadmin writes (0004) ----------
select pg_temp.as_anon();
select pg_temp.check((select install_pct from public.pricing_config where id = 1) is not null, 'anyone (anon) can read pricing_config');
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');  -- a manager
update public.pricing_config set install_pct = 99 where id = 1;   -- RLS hides the row: updates nothing, no error
select pg_temp.check((select install_pct from public.pricing_config where id = 1) <> 99, 'a non-superadmin cannot change pricing_config');
select pg_temp.as_user(:'admin');  -- superadmin
update public.pricing_config set install_pct = 12 where id = 1;
select pg_temp.check((select install_pct from public.pricing_config where id = 1) = 12, 'superadmin can change pricing_config');

-- ---------- 12. partner onboarding: access requests + invites (0005) ----------
-- anyone may submit an access request
select pg_temp.as_anon();
insert into public.access_requests (company, first_name, last_name, location, email)
  values ('Graz Pergolas', 'Max', 'Muster', 'Graz, AT', 'max@graz.test');
-- a non-superadmin cannot read requests
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');  -- a manager
select pg_temp.check((select count(*) from public.access_requests) = 0, 'a manager cannot see access requests');
-- the superadmin sees them
select pg_temp.as_user(:'admin');
select pg_temp.check((select count(*) from public.access_requests) >= 1, 'superadmin sees access requests');
-- only the superadmin may create an invite
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');  -- a manager
select pg_temp.check(pg_temp.fails($$insert into public.invites (role) values ('dealer')$$, 'row-level'), 'a manager cannot create an invite');
select pg_temp.as_user(:'admin');
insert into public.invites (role, discount_group_id) values ('dealer', (select id from public.discount_groups where code = 'dealer'));
select pg_temp.check((select count(*) from public.invites where role = 'dealer') = 1, 'superadmin can create an invite');
-- an invite is only for dealer or architect
select pg_temp.check(pg_temp.fails($$insert into public.invites (role) values ('client')$$, 'invites_role_check'), 'an invite role must be dealer or architect');

-- ---------- 13. reference projects on the landing page + their photo bucket (0008) ----------
select pg_temp.as_root();
insert into public.projects (id, title, district, country, options, photos, published, reference_available) values
  ('00000000-0000-0000-0000-0000000000c1', 'Villa mit Glasdach, Wien 13.', 'Wien 13', 'AT', '{bioklimatisch,glas}', '{a/1.jpg}', true, true),
  ('00000000-0000-0000-0000-0000000000c2', 'Entwurf', 'Linz', 'AT', '{zip}', '{}', false, false);
-- the public sees published projects only
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.projects) = 1, 'anon sees only published projects');
select pg_temp.check((select count(*) from public.projects where title = 'Entwurf') = 0, 'a draft project is hidden from the public');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country) values ('x', 'y', 'AT')$$, 'permission denied'), 'anon cannot add a project');
select pg_temp.check(pg_temp.fails($$update public.projects set published = false$$, 'permission denied'), 'anon cannot change a project');
select pg_temp.check(pg_temp.fails($$delete from public.projects$$, 'permission denied'), 'anon cannot delete a project');
-- dealer and superdealer read like the public and write nothing (only manager and superadmin write)
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.projects) = 1, 'a dealer sees only published projects');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country) values ('x', 'y', 'AT')$$, 'row-level'), 'a dealer cannot add a project');
update public.projects set title = 'hacked';
delete from public.projects;
select pg_temp.as_user(:'superdealer');
select pg_temp.check((select count(*) from public.projects) = 1, 'a superdealer sees only published projects');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country) values ('x', 'y', 'AT')$$, 'row-level'), 'a superdealer cannot add a project');
update public.projects set title = 'hacked';
delete from public.projects;
select pg_temp.as_user(:'admin');
select pg_temp.check((select count(*) from public.projects) = 2, 'superadmin sees drafts too');
select pg_temp.check((select count(*) from public.projects where title = 'hacked') = 0, 'dealer and superdealer cannot change a project (policy hides the write)');
-- the superadmin manages projects; the data rules hold
insert into public.projects (title, district, country, options, photos, published, sort)
  values ('Terrasse mit ZIP-Screens, Wien 19.', 'Wien 19', 'AT', '{bioklimatisch,zip,licht}', '{b/1.jpg,b/2.jpg}', true, 5);
update public.projects set sort = 1 where id = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.check((select sort from public.projects where id = '00000000-0000-0000-0000-0000000000c2') = 1, 'superadmin can edit a project');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country, published) values ('x', 'y', 'AT', true)$$, 'published_needs_photo'), 'a published project needs a photo');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country, options) values ('x', 'y', 'AT', '{sauna}')$$, 'projects_options_check'), 'only known options are allowed');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country) values ('x', 'y', 'DE')$$, 'projects_country_check'), 'country is AT or HR');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country) values ('  ', 'y', 'AT')$$, 'projects_title_check'), 'a title is required');
delete from public.projects where id = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.check((select count(*) from public.projects) = 2, 'superadmin can delete a project');
-- a manager adds and edits projects, sees drafts, but never deletes (only the superadmin)
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.projects) = 2, 'a manager sees drafts too');
insert into public.projects (id, title, district, country) values ('00000000-0000-0000-0000-0000000000c3', 'Von Manager', 'Graz', 'AT');
update public.projects set district = 'Graz 2' where id = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.check((select district from public.projects where id = '00000000-0000-0000-0000-0000000000c3') = 'Graz 2', 'a manager can add and edit a project');
update public.projects set photos = '{c/1.jpg}', published = true where id = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.check((select published from public.projects where id = '00000000-0000-0000-0000-0000000000c3'), 'a manager can publish a project');
delete from public.projects;
select pg_temp.check((select count(*) from public.projects) = 3, 'a manager cannot delete a project (policy hides the delete)');
-- photo bucket: public bucket; manager and superadmin upload, only the superadmin deletes
select pg_temp.as_root();
select pg_temp.check((select public from storage.buckets where id = 'project-photos'), 'the photo bucket is public');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('project-photos', 'x.jpg')$$, 'row-level'), 'anon cannot upload a photo');
select pg_temp.as_user(:'graz1');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('project-photos', 'x.jpg')$$, 'row-level'), 'a dealer cannot upload a photo');
select pg_temp.as_user(:'superdealer');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('project-photos', 'x.jpg')$$, 'row-level'), 'a superdealer cannot upload a photo');
select pg_temp.as_user(:'manager');
insert into storage.objects (bucket_id, name) values ('project-photos', 'm/1.jpg');
select pg_temp.check((select count(*) from storage.objects where name = 'm/1.jpg') = 1, 'a manager can upload and see a photo');
update storage.objects set name = 'm/2.jpg' where name = 'm/1.jpg';
select pg_temp.check((select count(*) from storage.objects where name = 'm/2.jpg') = 0, 'a manager cannot rename a photo');
update storage.objects set owner = :'manager' where name = 'm/1.jpg';  -- upsert is an UPDATE
select pg_temp.check((select count(*) from storage.objects where owner is not null) = 0, 'a manager cannot overwrite a photo');
select pg_temp.check(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('other-bucket', 'x.jpg')$$, 'row-level'), 'a manager cannot write to another bucket');
delete from storage.objects;
select pg_temp.check((select count(*) from storage.objects where name = 'm/1.jpg') = 1, 'a manager cannot delete a photo');
select pg_temp.as_user(:'admin');
insert into storage.objects (bucket_id, name) values ('project-photos', 'c/1.jpg');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'project-photos') = 2, 'superadmin can upload a photo');
select pg_temp.as_anon();
select pg_temp.check((select count(*) from storage.objects) = 0, 'the bucket cannot be listed by the public');
select pg_temp.as_user(:'admin');
delete from storage.objects;
select pg_temp.check((select count(*) from storage.objects) = 0, 'superadmin can delete a photo');
delete from public.projects where id = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.check((select count(*) from public.projects) = 2, 'superadmin can delete a manager''s project');

-- ---------- 14. role manager (0009): lead source, assignment, role change ----------
select pg_temp.as_user(:'manager');
select pg_temp.check((select source from public.leads where id = :'lead_anna') = 'manager', 'a manager''s lead has source manager');
select pg_temp.check((select assigned_to from public.leads where id = :'lead_anna') is not null, 'a manager''s lead is assigned from the start');
select pg_temp.fails($$select 'seller'::public.app_role$$, 'invalid input value for enum') as ok \gset
select pg_temp.check(:'ok', 'the label seller no longer exists');
-- a tab opened before the change still sends source seller: it becomes manager
insert into public.leads (created_by, source, contact_name, phone) values (:'manager', 'seller', 'Old tab', '+43 5');
select pg_temp.check((select source from public.leads where contact_name = 'Old tab') = 'manager', 'the old source seller becomes manager');
select pg_temp.check((select assigned_to from public.leads where contact_name = 'Old tab') = :'manager', 'the lead of a manager is his own at once');
select pg_temp.as_user(:'admin');
select public.assign_lead((select id from public.leads where contact_name = 'Old tab'), :'manager');
select pg_temp.check((select count(*) from public.lead_events where kind = 'assigned' and to_user = :'manager') >= 1, 'the superadmin can assign a lead to a manager');
select pg_temp.as_user(:'manager');
select public.transfer_lead((select id from public.leads where contact_name = 'Old tab'), :'graz1', 'weiter');
select pg_temp.check((select assigned_to from public.leads where contact_name = 'Old tab') = :'graz1', 'a manager can pass a lead to a dealer');
select pg_temp.as_user(:'superdealer');
select public.set_user_role(:'newbie', 'client');
select pg_temp.as_user(:'admin');
select public.set_user_role(:'newbie', 'manager');
select pg_temp.as_root();
select pg_temp.check((select role from public.profiles where id = :'newbie') = 'manager', 'the superadmin can make someone a manager');
-- nobody raises his own role or limit by a plain UPDATE: only full_name and phone are granted on profiles
select pg_temp.as_user(:'manager');
select pg_temp.fails(format($q$update public.profiles set role = 'superadmin' where id = %L$q$, :'manager'), 'permission denied') as okr \gset
select pg_temp.check(:'okr', 'a manager cannot set his own role by a direct update');
select pg_temp.fails(format($q$update public.profiles set discount_limit = 100 where id = %L$q$, :'manager'), 'permission denied') as okl \gset
select pg_temp.check(:'okl', 'a manager cannot set his own discount limit by a direct update');
select pg_temp.as_user(:'superdealer');
select pg_temp.fails(format($q$select public.set_user_role(%L, 'client')$q$, :'newbie'), 'FORBIDDEN') as ok \gset
select pg_temp.as_root();
select pg_temp.check(:'ok' and (select role from public.profiles where id = :'newbie') = 'manager', 'a superdealer cannot change a manager''s role');

-- ---------- 15. a manager reads new site requests (0012), read only ----------
-- Karl's request is still unassigned: no creator, no assignee. Maria's went to a dealer in section 3.
select pg_temp.as_service();
select public.submit_request('{"name":"Journey Test","email":"j@x.at"}', '{"catalog":"c","config":{},"total_net":5}', '{}', 'Schritt 1: Breite 4000') as n3 \gset
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.leads where source = 'web') = 2, 'a manager sees the two unassigned site requests, not the assigned one');
select pg_temp.check((select count(*) from public.leads where id = :'lead_maria') = 0, 'a manager does not see a site request after it went to a dealer');
select pg_temp.check((select journey from public.leads where contact_name = 'Journey Test') = 'Schritt 1: Breite 4000', 'a manager reads the client journey');
select pg_temp.check((select count(*) from public.quotes where number = :'n3') = 1, 'a manager reads the quote of a site request');
select pg_temp.check((select count(*) from public.quotes where lead_id = :'lead_maria') = 0, '... but not the quote of an assigned one');
select pg_temp.check((select count(*) from public.lead_events e join public.leads l on l.id = e.lead_id where l.contact_name = 'Journey Test') >= 1, 'a manager reads the history of a site request');
select pg_temp.check((select count(*) from public.lead_board where contact_name = 'Journey Test') = 1, 'a manager sees it on the board view');
-- read only: updates hit no row, no comment, no assignment
update public.leads set note = 'hacked', contact_name = 'X' where contact_name = 'Journey Test';
select pg_temp.as_root();
select pg_temp.check((select count(*) from public.leads where contact_name = 'Journey Test' and note is null) = 1, 'a manager cannot edit a site request');
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails(format('select public.comment_lead(%L, %L)', (select id from public.leads where contact_name = 'Journey Test'), 'hi'), 'FORBIDDEN'), 'a manager cannot comment on an unassigned site request');
select pg_temp.check(pg_temp.fails(format('select public.assign_lead(%L, %L)', (select id from public.leads where contact_name = 'Journey Test'), :'manager'), 'FORBIDDEN'), 'a manager cannot assign a site request to himself');
select pg_temp.check(pg_temp.fails($q$delete from public.leads$q$, 'permission denied'), 'a manager cannot delete leads');
-- not a dealer's lead
select pg_temp.check((select count(*) from public.leads where source = 'dealer') = 0, 'a manager sees no dealer lead');
-- everybody else
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.leads where contact_name in ('Journey Test', 'Karl')) = 0, 'a dealer does not see unassigned site requests');
select pg_temp.as_user(:'linz');
select pg_temp.check((select count(*) from public.leads where source = 'web') = 0 and (select count(*) from public.quotes) = 0, 'another dealer does not see them either');
select pg_temp.as_user(:'client');
select pg_temp.check((select count(*) from public.leads) = 0 and (select count(*) from public.lead_events) = 0, 'a client does not see site requests');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($q$select journey from public.leads$q$, 'permission denied'), 'anon cannot read the journey');
select pg_temp.check(pg_temp.fails($q$select * from public.lead_events$q$, 'permission denied'), 'anon cannot read the history');
select pg_temp.check(pg_temp.fails($q$select public.submit_request('{"email":"a@b.at"}', '{"catalog":"c","config":{},"total_net":1}')$q$, 'permission denied'), 'anon still cannot call submit_request (0012)');
-- narrowing: only stage 'new' (and still unassigned) is visible
select pg_temp.as_service();
select public.submit_request('{"name":"Stage Test","email":"s@x.at"}', '{"catalog":"c","config":{},"total_net":5}') as n4 \gset
select public.submit_request('{"name":"Assign Test","email":"a@x.at"}', '{"catalog":"c","config":{},"total_net":5}') as n5 \gset
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.leads where contact_name in ('Stage Test', 'Assign Test')) = 2, 'a manager sees both fresh site requests');
select pg_temp.as_root();
update public.leads set stage = 'contacted' where contact_name = 'Stage Test';
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.leads where contact_name = 'Stage Test') = 0, 'a site request past stage new is not visible to a manager');
select pg_temp.check((select count(*) from public.quotes where number = :'n4') = 0, '... nor its quote');
select pg_temp.as_user(:'admin');
select public.assign_lead((select id from public.leads where contact_name = 'Assign Test'), :'graz1');
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.leads where contact_name = 'Assign Test') = 0, 'after assign_lead the request leaves the manager''s view');

-- orders: reading a lead gives no write on its orders; quotes cannot be attached to a lead one may only see
select pg_temp.as_root();
insert into public.orders (lead_id, paid) select id, false from public.leads where contact_name = 'Journey Test';
insert into public.orders (lead_id, paid) select id, false from public.leads where contact_name = 'Assign Test';
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.orders o join public.leads l on l.id = o.lead_id where l.contact_name = 'Journey Test') = 1, 'a manager reads the order of a site request');
update public.orders set paid = true, seller_id = :'manager' where lead_id = (select id from public.leads where contact_name = 'Journey Test');
select pg_temp.as_root();
select pg_temp.check((select paid is false and seller_id is null from public.orders where lead_id = (select id from public.leads where contact_name = 'Journey Test')), 'a manager cannot change the order of a site request');
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails(format('insert into public.orders (lead_id) values (%L)', (select id from public.leads where contact_name = 'Journey Test')), 'row-level security'), 'a manager cannot create an order for a site request');
select pg_temp.check(pg_temp.fails(format($q$insert into public.quotes (owner, lead_id, catalog, config, total_net) values (%L, %L, 'c', '{}', 1)$q$, :'manager', (select id from public.leads where contact_name = 'Journey Test')), 'row-level security'), 'a manager cannot attach a quote to a site request');
-- dealer leads are not editable either (the assigned dealer's colleague of another org, a manager)
select pg_temp.as_user(:'linz');
select pg_temp.check(pg_temp.fails(format($q$insert into public.quotes (owner, lead_id, catalog, config, total_net) values (%L, %L, 'c', '{}', 1)$q$, :'linz', :'lead_maria'), 'row-level security'), 'a dealer of another organisation cannot attach a quote to a foreign lead');
-- unchanged: the assigned dealer, a colleague of his organisation and the superadmin write as before
select pg_temp.as_user(:'graz1');
insert into public.quotes (owner, lead_id, catalog, config, total_net) values (:'graz1', :'lead_maria', 'c', '{}', 1);
insert into public.orders (lead_id) values (:'lead_maria');
update public.orders set paid = true, seller_id = :'graz1' where lead_id = :'lead_maria';
select pg_temp.check((select paid from public.orders where lead_id = :'lead_maria'), 'the assigned dealer creates and changes his order and attaches a quote');
select pg_temp.as_user(:'graz2');
update public.orders set note = 'colleague' where lead_id = :'lead_maria';
select pg_temp.as_root();
select pg_temp.check((select note from public.orders where lead_id = :'lead_maria') = 'colleague', 'a colleague of the same organisation changes the order');
select pg_temp.as_user(:'admin');
update public.orders set note = 'admin' where lead_id = (select id from public.leads where contact_name = 'Journey Test');
insert into public.quotes (owner, lead_id, catalog, config, total_net) values (:'admin', (select id from public.leads where contact_name = 'Journey Test'), 'c', '{}', 1);
select pg_temp.as_root();
select pg_temp.check((select note from public.orders where lead_id = (select id from public.leads where contact_name = 'Journey Test')) = 'admin', 'the superadmin changes orders and attaches quotes as before');
-- a manager who is assigned the lead writes as before
select pg_temp.as_user(:'admin');
select public.assign_lead((select id from public.leads where contact_name = 'Journey Test'), :'manager');
select pg_temp.as_user(:'manager');
update public.orders set paid = true where lead_id = (select id from public.leads where contact_name = 'Journey Test');
insert into public.quotes (owner, lead_id, catalog, config, total_net) values (:'manager', (select id from public.leads where contact_name = 'Journey Test'), 'c', '{}', 1);
select pg_temp.as_root();
select pg_temp.check((select paid from public.orders where lead_id = (select id from public.leads where contact_name = 'Journey Test')), 'a manager assigned to the lead changes its order and attaches a quote');

-- the rule is exactly "web, no creator, no assignee, new": neighbouring shapes stay invisible to a manager
select pg_temp.as_root();
alter table public.leads disable trigger user;
insert into public.leads (source, created_by, contact_name, phone) values ('web', :'admin', 'Shape created', '+43 9');
insert into public.leads (source, contact_name, phone) values ('dealer', 'Shape dealer', '+43 9');
alter table public.leads enable trigger user;
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.leads where contact_name in ('Shape created', 'Shape dealer')) = 0, 'a manager does not see a lead with a creator, or a non-site lead without an assignee');

select 'access tests passed' as result;
