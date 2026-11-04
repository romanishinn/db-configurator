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
select pg_temp.check((select count(*) from public.leads) = 0, 'a manager sees nothing that is not his');

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
  ('00000000-0000-0000-0000-0000000000c1', 'Villa mit Glasdach, Wien 13.', 'Wien 13', 'AT', '{bioklimatisch,glas}', '{a/1.jpg}', false, true),
  ('00000000-0000-0000-0000-0000000000c2', 'Entwurf', 'Linz', 'AT', '{zip}', '{}', false, false);
-- 0010: publishing needs a recorded consent, so the published fixture gets one first
insert into public.project_private (project_id, consent_at, consent_channel, consent_version) values ('00000000-0000-0000-0000-0000000000c1', now(), 'paper', 'v0');
update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000c1';
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
insert into public.projects (id, title, district, country, options, photos, sort)
  values ('00000000-0000-0000-0000-0000000000c4', 'Terrasse mit ZIP-Screens, Wien 19.', 'Wien 19', 'AT', '{bioklimatisch,zip,licht}', '{b/1.jpg,b/2.jpg}', 5);
select public.record_consent('00000000-0000-0000-0000-0000000000c4', 'call', 'v1', true, false);
update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000c4';
update public.projects set sort = 1 where id = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.check((select sort from public.projects where id = '00000000-0000-0000-0000-0000000000c2') = 1, 'superadmin can edit a project');
select pg_temp.check(pg_temp.fails($$update public.projects set photos = '{}' where id = '00000000-0000-0000-0000-0000000000c4'$$, 'published_needs_photo'), 'a published project needs a photo');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country, options) values ('x', 'y', 'AT', '{sauna}')$$, 'projects_options_check'), 'only known options are allowed');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country) values ('x', 'y', 'DE')$$, 'projects_country_check'), 'country is AT or HR');
select pg_temp.check(pg_temp.fails($$update public.projects set title = '  ' where id = '00000000-0000-0000-0000-0000000000c4'$$, 'published_needs_text'), 'a published project needs a title');
select pg_temp.check(pg_temp.fails($$update public.projects set district = '' where id = '00000000-0000-0000-0000-0000000000c4'$$, 'published_needs_text'), 'a published project needs a district');
insert into public.projects (title, district, country) values ('', '', 'AT');  -- a draft (a dealer's request) may start empty
delete from public.projects where id = '00000000-0000-0000-0000-0000000000c2' or (title = '' and district = '');
select pg_temp.check((select count(*) from public.projects) = 2, 'superadmin can delete a project');
-- a manager adds and edits projects, sees drafts, but never deletes (only the superadmin)
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.projects) = 2, 'a manager sees drafts too');
insert into public.projects (id, title, district, country) values ('00000000-0000-0000-0000-0000000000c3', 'Von Manager', 'Graz', 'AT');
update public.projects set district = 'Graz 2' where id = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.check((select district from public.projects where id = '00000000-0000-0000-0000-0000000000c3') = 'Graz 2', 'a manager can add and edit a project');
select public.record_consent('00000000-0000-0000-0000-0000000000c3', 'call', 'v1', false, false);
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

-- ---------- 15. dealer sends a project, the office checks, records the owner's consent and publishes (0010) ----------
select pg_temp.as_root();
insert into public.leads (id, created_by, assigned_to, source, contact_name, phone, postcode) values
  ('00000000-0000-0000-0000-0000000000d1', :'graz1', :'graz1', 'dealer', 'Order G1', '+43 1', '8010'),
  ('00000000-0000-0000-0000-0000000000d2', :'linz', :'linz', 'dealer', 'Order L', '+43 2', '4020');
insert into public.orders (id, lead_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1'),  -- installed, confirmed by the office
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1'),  -- still in the inbox
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d1'),  -- 'done' set by the dealer himself
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000d1'),  -- rejected for light, sent again
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000d2');  -- a foreign dealer's order
\set o_ok '00000000-0000-0000-0000-0000000000e1'
\set o_inbox '00000000-0000-0000-0000-0000000000e2'
\set o_self '00000000-0000-0000-0000-0000000000e3'
\set o_light '00000000-0000-0000-0000-0000000000e4'
\set o_foreign '00000000-0000-0000-0000-0000000000e5'
-- only the office confirms an installation; the event carries the author
select pg_temp.as_user(:'graz1');
select pg_temp.check(pg_temp.fails(format($q$select public.complete_installation(%L)$q$, :'o_ok'), 'FORBIDDEN'), 'a dealer cannot complete an installation');
update public.orders set stage = 'done' where id = :'o_self';  -- the old rule still lets him; the project function must not trust it
select pg_temp.as_user(:'manager');
select public.complete_installation(:'o_ok');
select public.complete_installation(:'o_light');
select public.complete_installation(:'o_foreign');
select pg_temp.as_root();
select pg_temp.check((select count(*) from public.lead_events where order_id = :'o_ok' and kind = 'stage' and order_to = 'done' and by = :'manager') = 1, 'completing an installation logs the manager as author');
select pg_temp.check((select stage from public.orders where id = :'o_ok') = 'done', 'the order is done');
select pg_temp.check((select count(*) from public.lead_events where order_id = :'o_self' and order_to = 'done' and by = :'graz1') = 1, 'the dealer''s own done is logged under his name');

-- refusals of submit_project
select pg_temp.as_user(:'graz1');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', false)$q$, :'o_ok'), 'ASSURANCE_REQUIRED'), 'a dealer must give the assurance');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', true)$q$, :'o_foreign'), 'ORDER_NOT_FOUND'), 'a dealer cannot send a project for a foreign order');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', true)$q$, :'o_inbox'), 'NOT_INSTALLED'), 'an order not yet done cannot be sent');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', true)$q$, :'o_self'), 'NOT_INSTALLED'), 'an order the dealer set to done himself cannot be sent');
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', true)$q$, :'o_ok'), 'FORBIDDEN'), 'only a dealer sends a project');
select pg_temp.as_user(:'client');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', true)$q$, :'o_ok'), 'FORBIDDEN'), 'a client cannot send a project');

-- the request
select pg_temp.as_user(:'graz1');
select public.submit_project(:'o_ok', 'Foto vom Montag', true) as pj \gset
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', true)$q$, :'o_ok'), 'ALREADY_SUBMITTED'), 'one active project per order');
select pg_temp.check((select title from public.projects where id = :'pj') = 'Bioklimatische Pergola, 8010, ' || to_char(now() at time zone 'Europe/Vienna', 'YYYY')
  and (select country || district || published::text || cardinality(photos) from public.projects where id = :'pj') = 'AT8010false0'
  and (select installed_on from public.projects where id = :'pj') = (now() at time zone 'Europe/Vienna')::date, 'the request is a draft filled from the order');
select pg_temp.check((select count(*) from public.project_private where project_id = :'pj' and submitted_by = :'graz1' and order_id = :'o_ok' and dealer_note = 'Foto vom Montag') = 1, 'the sender and the order are recorded');
select pg_temp.check((select count(*) from public.projects where id = :'pj') = 1 and (select count(*) from public.project_private) = 1, 'a dealer sees his own request');
select pg_temp.as_user(:'graz2');
select pg_temp.check((select count(*) from public.projects where id = :'pj') = 0 and (select count(*) from public.project_private) = 0, 'a colleague of the same company does not see the request');
select pg_temp.as_user(:'linz');
select pg_temp.check((select count(*) from public.projects where id = :'pj') = 0 and (select count(*) from public.project_private) = 0, 'another dealer does not see the request');
select pg_temp.as_user(:'superdealer');
select pg_temp.check((select count(*) from public.project_private) = 0, 'a superdealer does not see project_private');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($$select * from public.project_private$$, 'permission denied'), 'the public never reads project_private');
select pg_temp.as_root();
select pg_temp.check((select count(*) from public.notifications where kind = 'project_submitted' and user_id in (:'manager', :'admin')) = 2
  and (select count(*) from public.notifications n join public.profiles p on p.id = n.user_id where n.kind = 'project_submitted' and p.role not in ('manager', 'superadmin')) = 0
  and (select text from public.notifications where kind = 'project_submitted' limit 1) = 'Новая заявка проекта от дилера', 'managers and superadmins, and only they, are notified of a request');

-- the dealer writes nothing directly
select pg_temp.as_user(:'graz1');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country) values ('x', 'y', 'AT')$$, 'row-level'), 'a dealer cannot insert into projects');
update public.projects set title = 'hacked' where id = :'pj';
delete from public.projects where id = :'pj';
select pg_temp.check((select title from public.projects where id = :'pj') <> 'hacked', 'a dealer cannot update or delete his request in projects');
select pg_temp.check(pg_temp.fails(format($q$insert into public.project_private (project_id, submitted_by) values (%L, %L)$q$, '00000000-0000-0000-0000-0000000000c2', :'graz1'), 'row-level'), 'a dealer cannot insert into project_private');
update public.project_private set consent_at = now(), dealer_note = 'x' where project_id = :'pj';
select pg_temp.check((select consent_at is null and dealer_note = 'Foto vom Montag' from public.project_private where project_id = :'pj'), 'a dealer cannot grant consent to himself');
select pg_temp.check(pg_temp.fails($$delete from public.project_private$$, 'permission denied'), 'a dealer cannot delete from project_private');

-- photos: attach_photos
select pg_temp.as_user(:'graz2');
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, '{}')$q$, :'pj'), 'FORBIDDEN'), 'only the author attaches photos');
select pg_temp.as_user(:'graz1');
select gen_random_uuid() as f1, gen_random_uuid() as f2 \gset
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, (select array_agg(%L || '/' || gen_random_uuid() || '.jpg') from generate_series(1, 13)))$q$, :'pj', :'pj'), 'TOO_MANY_PHOTOS'), 'at most 12 photos');
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, array['evil/%s.jpg'])$q$, :'pj', :'f1'), 'BAD_PATH'), 'a photo path must lie in the project folder');
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, array['%s/x.png'])$q$, :'pj', :'pj'), 'BAD_PATH'), 'a photo path must be uuid.jpg');
-- storage: the dealer writes only into the folder of his own open project
select pg_temp.check(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('project-photos', %L)$q$, :'pj' || '/' || :'f1' || '.png'), 'row-level'), 'a dealer cannot upload a name other than uuid.jpg');
select pg_temp.check(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('project-photos', %L)$q$, :'pj' || '/a/' || :'f1' || '.jpg'), 'row-level'), 'a dealer cannot upload into a subfolder');
select pg_temp.check(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('project-photos', %L)$q$, '00000000-0000-0000-0000-0000000000c2/' || :'f1' || '.jpg'), 'row-level'), 'a dealer cannot upload into a project that is not his');
select pg_temp.check(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('project-photos', %L)$q$, :'f1' || '/' || :'f2' || '.jpg'), 'row-level'), 'a dealer cannot upload into a folder without a project');
select pg_temp.check(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('other-bucket', %L)$q$, :'pj' || '/' || :'f1' || '.jpg'), 'row-level'), 'a dealer cannot upload into another bucket');
select pg_temp.as_user(:'graz2');
select pg_temp.check(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('project-photos', %L)$q$, :'pj' || '/' || :'f1' || '.jpg'), 'row-level'), 'a colleague cannot upload into my project');
select pg_temp.as_user(:'graz1');
insert into storage.objects (bucket_id, name) values ('project-photos', :'pj' || '/' || :'f1' || '.jpg');
select pg_temp.check((select count(*) from storage.objects) = 0, 'a dealer cannot read files');
update storage.objects set name = :'pj' || '/' || :'f2' || '.jpg';
delete from storage.objects;
select pg_temp.as_root();
select pg_temp.check((select count(*) from storage.objects where name = :'pj' || '/' || :'f1' || '.jpg') = 1, 'a dealer can neither rename nor delete a file');
select pg_temp.as_user(:'graz1');
select public.attach_photos(:'pj', array[:'pj' || '/' || :'f1' || '.jpg']);
select pg_temp.check((select photos[1] from public.projects where id = :'pj') = :'pj' || '/' || :'f1' || '.jpg', 'attach_photos stores the paths');

-- the office: only manager and superadmin act; consent comes first
select pg_temp.check(pg_temp.fails(format($q$select public.reject_project(%L, 'light', null)$q$, :'pj'), 'FORBIDDEN'), 'a dealer cannot reject a project');
select pg_temp.check(pg_temp.fails(format($q$select public.unpublish_project(%L, null)$q$, :'pj'), 'FORBIDDEN'), 'a dealer cannot unpublish a project');
select pg_temp.check(pg_temp.fails(format($q$select public.record_consent(%L, 'call', 'v1', true, true)$q$, :'pj'), 'FORBIDDEN'), 'a dealer cannot record a consent');
select pg_temp.as_user(:'superdealer');
select pg_temp.check(pg_temp.fails(format($q$select public.reject_project(%L, 'light', null)$q$, :'pj'), 'FORBIDDEN'), 'a superdealer cannot reject a project');
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails(format($q$update public.projects set published = true where id = %L$q$, :'pj'), 'CONSENT_REQUIRED'), 'publishing without a consent is refused');
select pg_temp.check(pg_temp.fails(format($q$select public.record_consent(%L, 'sms', 'v1', true, true)$q$, :'pj'), 'project_private_consent_channel_check'), 'consent channel is call, form or paper');
select pg_temp.check(pg_temp.fails(format($q$select public.reject_project(%L, 'ugly', null)$q$, :'pj'), 'BAD_REASON'), 'a rejection needs a reason from the list');
select pg_temp.check(pg_temp.fails(format($q$select public.reject_project(%L, 'consent_withdrawn', null)$q$, :'pj'), 'BAD_REASON'), 'consent_withdrawn is set only by unpublish');
select public.record_consent(:'pj', 'form', 'v1', true, true);
select pg_temp.check((select consent_at is not null and consent_by = :'manager' and consent_channel = 'form' and consent_version = 'v1' and consent_district from public.project_private where project_id = :'pj')
  and (select reference_available from public.projects where id = :'pj'), 'the consent is recorded with author, channel, version and scope');
update public.projects set published = true, title = 'Pergola, Graz', district = 'Graz' where id = :'pj';
select pg_temp.check((select published from public.projects where id = :'pj'), 'with a consent the project is published');
select pg_temp.as_anon();
select pg_temp.check((select count(*) from public.projects where id = :'pj') = 1, 'the public sees the published project');
select pg_temp.as_user(:'graz1');
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, '{}')$q$, :'pj'), 'PROJECT_LOCKED'), 'photos of a published project are locked');
select pg_temp.check(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('project-photos', %L)$q$, :'pj' || '/' || :'f2' || '.jpg'), 'row-level'), 'a dealer cannot upload into a published project');
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails(format($q$select public.reject_project(%L, 'light', null)$q$, :'pj'), 'PROJECT_PUBLISHED'), 'a published project is unpublished, not rejected');
delete from storage.objects where name like :'pj' || '/%';
select pg_temp.as_root();
select pg_temp.check((select count(*) from storage.objects where name = :'pj' || '/' || :'f1' || '.jpg') = 1, 'a manager cannot delete a file of a published project');
select pg_temp.as_user(:'manager');
-- withdrawal of the consent
select public.unpublish_project(:'pj', 'Eigentümer ruft an');
select pg_temp.check(not (select published from public.projects where id = :'pj') and (select rejected_reason from public.project_private where project_id = :'pj') = 'consent_withdrawn', 'unpublishing records the withdrawal');
select pg_temp.check(pg_temp.fails(format($q$update public.projects set published = true where id = %L$q$, :'pj'), 'CONSENT_REQUIRED'), 'a withdrawn project cannot be published again');
select pg_temp.check(pg_temp.fails(format($q$select public.record_consent(%L, 'call', 'v2', true, true)$q$, :'pj'), 'CONSENT_WITHDRAWN'), 'a consent cannot revive a withdrawn project');
delete from storage.objects where name like :'pj' || '/%';
select pg_temp.as_root();
select pg_temp.check((select count(*) from storage.objects where name like :'pj' || '/%') = 0, 'a manager deletes the files of an unpublished project');
select pg_temp.check((select count(*) from public.notifications where kind = 'project_unpublished' and user_id = :'graz1') = 1, 'the dealer is told about the withdrawal');
select pg_temp.as_user(:'graz1');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'again', true)$q$, :'o_ok'), 'ALREADY_SUBMITTED'), 'after a withdrawn consent the order cannot be sent again');
select pg_temp.check(pg_temp.fails(format($q$insert into storage.objects (bucket_id, name) values ('project-photos', %L)$q$, :'pj' || '/' || :'f2' || '.jpg'), 'row-level'), 'a dealer cannot upload into a withdrawn project');

-- rejection for quality: the dealer may send again
select public.submit_project(:'o_light', null, true) as pjl \gset
select pg_temp.as_user(:'manager');
select public.reject_project(:'pjl', 'light', 'zu dunkel');
select pg_temp.as_user(:'graz1');
select pg_temp.check((select rejected_reason || rejected_note from public.project_private where project_id = :'pjl') = 'lightzu dunkel', 'the dealer sees the reason of the rejection');
select pg_temp.check((select count(*) from public.notifications where kind = 'project_rejected' and user_id = :'graz1') = 1, 'the dealer is notified of the rejection');
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, '{}')$q$, :'pjl'), 'PROJECT_LOCKED'), 'photos of a rejected request are locked');
select public.submit_project(:'o_light', 'neu', true) as pjl2 \gset
select pg_temp.check(:'pjl2' <> :'pjl', 'after a rejection for light the order can be sent again');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'x', true)$q$, :'o_light'), 'ALREADY_SUBMITTED'), 'the second request is the active one');

-- projects added by the office need a consent too
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails($$insert into public.projects (title, district, country, photos, published) values ('Büro', 'Wien', 'AT', '{x/1.jpg}', true)$$, 'CONSENT_REQUIRED'), 'an office project cannot be inserted as published');
insert into public.projects (id, title, district, country, photos) values ('00000000-0000-0000-0000-0000000000c5', 'Büro', 'Wien', 'AT', '{x/1.jpg}');
select pg_temp.check(pg_temp.fails($$update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000c5'$$, 'CONSENT_REQUIRED'), 'an office project without any private row cannot be published');
select public.record_consent('00000000-0000-0000-0000-0000000000c5', 'paper', 'v1', false, false);
update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000c5';
select pg_temp.check((select published from public.projects where id = '00000000-0000-0000-0000-0000000000c5') and (select submitted_by is null from public.project_private where project_id = '00000000-0000-0000-0000-0000000000c5'), 'record_consent creates the private row of an office project');
select pg_temp.check(pg_temp.fails(format($q$select public.complete_installation(%L)$q$, '00000000-0000-0000-0000-000000000099'), 'ORDER_NOT_FOUND'), 'completing a missing order is refused');

select 'access tests passed' as result;
