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
select pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, total_net, discount) values (%L, 'c', '{}', 1, '{"pergola": -1}')$q$, :'graz1'), 'DISCOUNT_LIMIT') as ok1 \gset
select pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, total_net, discount) values (%L, 'c', '{}', 1, '{"options": 5}')$q$, :'graz1'), 'DISCOUNT_SCOPE') as ok2 \gset
select pg_temp.fails($q$update public.quotes set total_net = 1$q$, 'permission denied') as ok3 \gset
select pg_temp.fails(format($q$insert into public.quotes (owner, number, catalog, config, total_net) values (%L, 'X-1', 'c', '{}', 1)$q$, :'graz1'), 'permission denied') as ok4 \gset
select pg_temp.check(:'ok1', 'a negative discount is refused');
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
-- 0017: publishing needs a recorded consent, so the published fixture gets one first
insert into public.project_private (project_id, consent_at, consent_channel, consent_version, consent_district) values ('00000000-0000-0000-0000-0000000000c1', now(), 'paper', 'v0', true);
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
update public.projects set district = '' where id = '00000000-0000-0000-0000-0000000000c4';
select pg_temp.check((select published from public.projects where id = '00000000-0000-0000-0000-0000000000c4'), 'a published project needs no district (optional since 0017)');
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
-- 0018: the old source seller is refused (the compatibility is gone); a lead with source manager is his own at once
select pg_temp.check(pg_temp.fails($q$insert into public.leads (created_by, source, contact_name, phone) values ('00000000-0000-0000-0000-000000000003', 'seller', 'Old tab', '+43 5')$q$, 'leads_source_check'), 'the old source seller is refused');
insert into public.leads (created_by, source, contact_name, phone) values (:'manager', 'manager', 'Old tab', '+43 5');
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
-- ... nor re-link an existing own quote to it by UPDATE
insert into public.quotes (owner, lead_id, catalog, config, total_net) values (:'manager', null, 'c', '{}', 999999);
select pg_temp.check(pg_temp.fails(format($q$update public.quotes set lead_id = %L where owner = %L and total_net = 999999$q$, (select id from public.leads where contact_name = 'Journey Test'), :'manager'), 'row-level security'), 'a manager cannot re-link a quote to a site request by UPDATE');
-- dealer leads are not editable either (the assigned dealer's colleague of another org, a manager)
select pg_temp.as_user(:'linz');
select pg_temp.check(pg_temp.fails(format($q$insert into public.quotes (owner, lead_id, catalog, config, total_net) values (%L, %L, 'c', '{}', 1)$q$, :'linz', :'lead_maria'), 'row-level security'), 'a dealer of another organisation cannot attach a quote to a foreign lead');
insert into public.quotes (owner, lead_id, catalog, config, total_net) values (:'linz', null, 'c', '{}', 3);
select pg_temp.check(pg_temp.fails(format($q$update public.quotes set lead_id = %L where owner = %L and total_net = 3$q$, :'lead_maria', :'linz'), 'row-level security'), 'a dealer of another organisation cannot re-link a quote to a foreign lead by UPDATE');
-- unchanged: the assigned dealer, a colleague of his organisation and the superadmin write as before
select pg_temp.as_user(:'graz1');
insert into public.quotes (owner, lead_id, catalog, config, total_net) values (:'graz1', null, 'c', '{}', 2);
update public.quotes set lead_id = :'lead_maria' where owner = :'graz1' and lead_id is null and total_net = 2;
select pg_temp.check((select count(*) from public.quotes where owner = :'graz1' and lead_id = :'lead_maria' and total_net = 2) = 1, 'the assigned dealer re-links his own quote to his lead');
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

-- ---------- 16. CRM: customers view (0010) and the "next action" text ----------
select pg_temp.check(public.norm_phone('+43 660 112 020') = public.norm_phone('0660 112 020') and public.norm_phone('0043 660 112 020') = '660112020', 'phone formats of one number match');
select pg_temp.check(public.norm_phone('') is null and public.norm_phone(null) is null, 'an empty phone has no key');
select pg_temp.as_user(:'manager');
insert into public.leads (created_by, source, contact_name, phone, next_action, next_action_at) values
  (:'manager', 'manager', 'Eva Berger', '+43 660 112 020', 'Позвонить', current_date),
  (:'manager', 'manager', 'Eva B.', '0660 112 020', null, null),
  (:'manager', 'manager', 'Tom', null, null, null);
select pg_temp.check((select leads from public.customers where key = '660112020') = 2, 'one person with two phone formats is one customer with 2 leads');
select pg_temp.check((select name from public.customers where key = '660112020') in ('Eva Berger', 'Eva B.'), 'the customer has a name');
select pg_temp.check((select count(*) from public.customers where name = 'Tom') = 0, 'a lead without phone and e-mail is not a customer');
update public.leads set next_action = 'Отправить КП' where contact_name = 'Eva Berger';
select pg_temp.check((select next_action from public.leads where contact_name = 'Eva Berger') = 'Отправить КП', 'the owner can edit next_action');
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.customers where key = '660112020') = 0, 'a dealer does not see a manager''s customer');
select pg_temp.as_user(:'admin');
select pg_temp.check((select count(*) from public.customers where key = '660112020') = 1, 'superadmin sees the customer');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($$select * from public.customers$$, 'permission denied'), 'the public site cannot read customers');


-- ---------- 17. a discount above the personal limit goes to approval (0011) ----------
select pg_temp.as_user(:'graz1');   -- dealer, limit 10
insert into public.quotes (owner, lead_id, catalog, config, total_net, discount) values (:'graz1', :'lead_maria', 'catalog-2026-07', '{}', 20000, '{"pergola": 12}') returning id as qa \gset
insert into public.quotes (owner, lead_id, catalog, config, total_net, discount) values (:'graz1', :'lead_maria', 'catalog-2026-07', '{}', 21000, '{"pergola": 15}') returning id as qb \gset
select pg_temp.check((select count(*) from public.quote_approvals where status = 'pending') = 2, 'a discount above the limit is saved and waits for approval');
select pg_temp.check((select count(*) from public.quote_approvals where quote_id = (select id from public.quotes where owner = :'graz1' and discount = '{"pergola": 10, "sides": 5}')) = 0, 'a discount within the limit needs no approval');
select pg_temp.fails(format($q$select public.decide_approval(%L, true)$q$, :'qa'), 'FORBIDDEN') as okd \gset
select pg_temp.check(:'okd', 'a dealer cannot approve his own discount');
select pg_temp.as_user(:'graz2');   -- colleague of the same company
select pg_temp.check((select count(*) from public.quote_approvals) = 0, 'a colleague does not see the approval of another''s quote');
select pg_temp.as_user(:'linz');
select pg_temp.check((select count(*) from public.quote_approvals) = 0, 'another dealer does not see approvals');
select pg_temp.as_user(:'admin');
select pg_temp.check((select count(*) from public.quote_approvals where status = 'pending') = 2, 'superadmin sees the queue');
select pg_temp.fails(format($q$select public.decide_approval(%L, false)$q$, :'qb'), 'COMMENT_REQUIRED') as okr \gset
select pg_temp.check(:'okr', 'a rejection needs a comment');
select public.decide_approval(:'qa', true);
select public.decide_approval(:'qb', false, 'Слишком большая скидка');
select pg_temp.check((select status from public.quote_approvals where quote_id = :'qa') = 'approved', 'approved');
select pg_temp.check((select status from public.quote_approvals where quote_id = :'qb') = 'rejected' and (select decided_by from public.quote_approvals where quote_id = :'qb') = :'admin', 'rejected with the decider recorded');
select pg_temp.fails(format($q$select public.decide_approval(%L, true)$q$, :'qa'), 'NO_PENDING_APPROVAL') as ok2x \gset
select pg_temp.check(:'ok2x', 'a decision is final');
insert into public.quotes (owner, catalog, config, total_net, discount) values (:'admin', 'catalog-2026-07', '{}', 5000, '{"pergola": 40}');
select pg_temp.check((select count(*) from public.quote_approvals) = 2, 'the superadmin has no limit and no approval');
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.notifications where kind = 'approval' and text like 'Скидка отклонена%') = 1, 'the owner is told about the rejection');
select pg_temp.check((select count(*) from public.quote_approvals) = 2, 'the owner sees the decisions on his quotes');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($$select public.quote_over_limit(null, '{}')$$, 'permission denied'), 'the limit check is not callable from the public API');
select pg_temp.check(pg_temp.fails($$select public.decide_approval(null, true)$$, 'permission denied'), 'anonymous cannot decide');

-- ---------- 18. architect: only his own projects and quotes (0011) ----------
select pg_temp.as_root();
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000009', 'arch@db.test');
update public.profiles set role = 'architect', discount_limit = 0 where id = '00000000-0000-0000-0000-000000000009';
\set arch '00000000-0000-0000-0000-000000000009'
select pg_temp.as_user(:'arch');
insert into public.leads (created_by, source, contact_name, phone) values (:'arch', 'office', 'Arch Project', '+43 1 777');
insert into public.quotes (owner, lead_id, catalog, config, total_net) select :'arch', id, 'catalog-2026-07', '{}', 8000 from public.leads where contact_name = 'Arch Project';
select pg_temp.check((select count(*) from public.leads) = 1, 'an architect sees only the project he entered');
select pg_temp.check((select count(*) from public.quotes) = 1, 'an architect sees only his own quotes');
select pg_temp.check((select count(*) from public.lead_board) = 1 and (select count(*) from public.customers) = 1, 'the board and customers show only his own');
select pg_temp.check((select count(*) from public.lead_events) >= 1 and (select count(distinct lead_id) from public.lead_events) = 1, 'history only of his own project');
select pg_temp.check(pg_temp.fails(format($q$insert into public.leads (created_by, source, contact_name) values (%L, 'office', 'Fake')$q$, :'manager'), 'row-level'), 'an architect cannot enter a lead in somebody else''s name');
update public.leads set note = 'mine' where contact_name = 'Arch Project';
update public.leads set note = 'hacked' where contact_name = 'Anna';
select pg_temp.check((select note from public.leads where contact_name = 'Arch Project') = 'mine', 'an architect edits his own project');
select pg_temp.check(pg_temp.fails(format($q$select public.assign_lead(%L, %L)$q$, (select id from public.leads limit 1), :'arch'), 'FORBIDDEN'), 'an architect cannot assign leads');
select pg_temp.check((select count(*) from public.orders) = 0 and (select count(*) from public.notifications) = 0, 'an architect sees no orders and no notifications of others');
select pg_temp.as_user(:'admin');
select pg_temp.check((select note from public.leads where contact_name = 'Anna') is distinct from 'hacked', 'a lead of somebody else is untouched');
select pg_temp.check((select score from public.lead_board limit 1) is not null, 'the board carries the score');
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.leads where contact_name = 'Arch Project') = 0, 'a manager does not see an architect''s project');


-- ---------- 19. paged lead list, counters and statistics (0013): rows follow the caller's rights ----------
select pg_temp.as_user(:'admin');
select pg_temp.check((select count(*) from public.lead_page('all', null, 100, 0)) = (select count(*) from public.leads), 'the superadmin''s list covers every lead');
select count(*) as total_all from public.leads \gset
select pg_temp.check((select count(distinct id) from (select * from public.lead_page('all', null, 2, 0) union all select * from public.lead_page('all', null, 2, 2)) x) = least(4, :total_all), 'two pages do not overlap');
select pg_temp.check((select count(*) from public.lead_page('all', 'Eva', 40, 0)) >= 1, 'search by a part of the name');
select pg_temp.check((select count(*) from public.lead_page('all', '660112020', 40, 0) where contact_name like 'Eva%') >= 1 and (select count(*) from public.lead_page('all', '0660 112 020', 40, 0) where contact_name like 'Eva%') >= 1, 'search by the digits of a phone in any format');
select pg_temp.check((select count(*) from public.lead_page('all', '%', 40, 0)) = 0, 'a wildcard typed in the search is not a wildcard');
select pg_temp.check((select count(*) from public.lead_page('nonsense', null, 40, 0)) = 0, 'an unknown filter returns nothing');
select pg_temp.check((select count(*) from public.lead_page('open', null, 1000, 0)) <= 100, 'a page is capped at 100 rows');
select pg_temp.check((select "open" + won + lost from public.lead_counts()) = :total_all, 'the counters add up to all leads');
select pg_temp.check((select (public.crm_stats() ->> 'open')::int + (public.crm_stats() ->> 'won')::int + (public.crm_stats() ->> 'lost')::int) = :total_all, 'the statistics add up to all leads');
-- every role gets only what row level security lets it see
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.lead_page('all', null, 100, 0)) = (select count(*) from public.leads), 'a dealer''s list equals the leads he sees');
select pg_temp.check((select "open" + won + lost from public.lead_counts()) = (select count(*) from public.leads), 'a dealer''s counters follow his visibility');
select pg_temp.check(not exists (select 1 from public.lead_page('all', 'Eva', 40, 0)), 'a dealer cannot find a lead of somebody else by search');
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.lead_page('all', null, 100, 0)) = (select count(*) from public.leads), 'a manager''s list equals his leads');
select pg_temp.check((select (public.crm_stats() ->> 'open')::int + (public.crm_stats() ->> 'won')::int + (public.crm_stats() ->> 'lost')::int) = (select count(*) from public.leads), 'a manager''s statistics cover his leads only');
select pg_temp.as_user(:'arch');
select pg_temp.check((select count(*) from public.lead_page('all', null, 100, 0)) = (select count(*) from public.leads) and (select count(*) from public.lead_page('all', null, 100, 0)) = 1, 'an architect''s list is his own project only');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($$select * from public.lead_page('all')$$, 'permission denied'), 'the public site cannot read the list');
select pg_temp.check(pg_temp.fails($$select * from public.lead_counts()$$, 'permission denied') and pg_temp.fails($$select public.crm_stats()$$, 'permission denied'), 'nor the counters and statistics');

-- ---------- 20. access hardening (0014): deactivated logins, company fields, org_of, discount groups, API grants ----------
select pg_temp.as_root();
update public.profiles set active = false where id = :'linz';
select pg_temp.as_user(:'linz');
select pg_temp.check((select count(*) from public.leads) = 0 and (select count(*) from public.quotes) = 0, 'a deactivated login sees no leads and quotes');
select pg_temp.check(pg_temp.fails(format('select public.transfer_lead(%L, %L, %L)', :'lead_anna', :'graz1', 'x'), 'FORBIDDEN'), 'a deactivated login cannot pass a lead on');
select pg_temp.as_root();
update public.profiles set active = true where id = :'linz';
select pg_temp.as_user(:'graz1');
select pg_temp.check(pg_temp.fails($q$update public.organizations set kind = 'db' where id = '00000000-0000-0000-0000-0000000000a1'$q$, 'FORBIDDEN'), 'a dealer cannot change the kind of his company');
select pg_temp.check(pg_temp.fails($q$update public.organizations set discount_group_id = (select id from public.discount_groups limit 1) where id = '00000000-0000-0000-0000-0000000000a1'$q$, 'FORBIDDEN'), 'a dealer cannot change his discount group');
select pg_temp.check(public.org_of(:'linz') is null, 'org_of does not reveal another company');
select pg_temp.as_user(:'client');
select pg_temp.check(public.org_of(:'graz1') is null, 'a client cannot look up anybody''s company');
select pg_temp.check((select count(*) from public.discount_groups) = 0, 'a client does not see the discount groups');
select pg_temp.as_root();
select pg_temp.check(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind in ('r', 'v') and (has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'truncate')
     or (c.relname not in ('pricing_config', 'projects') and has_table_privilege('anon', c.oid, 'select')))), 'the API roles have no grants beyond the intended ones');


-- ---------- 21. input limits and negative quote lines (0015) ----------
select pg_temp.as_service();
select pg_temp.check(pg_temp.fails($q$select public.submit_request('{"name":"x","phone":"+43 660 9"}', '{"catalog":"c","config":{},"lines":[{"a":-99999}],"total_net":1}')$q$, 'NEGATIVE_LINE'), 'the public site cannot send a quote with a negative line');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_request(jsonb_build_object('name', %L, 'phone', '+43 660 8'), '{"catalog":"c","config":{},"total_net":1}')$q$, repeat('x', 5000)), 'leads_input_limits'), 'a name of 5000 characters is refused');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_request('{"name":"x","phone":"+43 660 7"}', '{"catalog":"c","config":{},"total_net":1}', '{}', %L)$q$, repeat('j', 30000)), 'leads_input_limits'), 'a journey text of 30000 characters is refused');
select public.submit_request('{"name":"Normal Person","phone":"+43 660 6000"}', '{"catalog":"catalog-2026-07","config":{"width":4000},"lines":[{"t":"S400","a":13891},{"t":"Montage","a":1390}],"total_net":15281}') as nq \gset
select pg_temp.check(:'nq' is not null, 'a normal request still goes through');
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, lines, total_net) values (%L, 'c', '{}', '[{"a":1000},{"a":-900}]', 100)$q$, :'manager'), 'NEGATIVE_LINE'), 'a manager cannot hide a price cut in a negative line');
select pg_temp.check(pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, total_net) values (%L, 'c', '{}', 9999999)$q$, :'manager'), 'quotes_input_limits'), 'an absurd total is refused');
select pg_temp.check(pg_temp.fails(format($q$insert into public.quotes (owner, catalog, config, total_net) values (%L, 'c', %L, 1)$q$, :'manager', ('{"x":"' || repeat('a', 300000) || '"}')), 'quotes_input_limits'), 'a configuration of 300 KB is refused');
insert into public.quotes (owner, catalog, config, lines, total_net) values (:'manager', 'catalog-2026-07', '{}', '[{"a":1000},{"a":50}]', 1050);
select pg_temp.as_user(:'admin');
insert into public.quotes (owner, catalog, config, lines, total_net) values (:'admin', 'catalog-2026-07', '{}', '[{"a":1000},{"a":-100}]', 900);
select pg_temp.check(true, 'the superadmin may enter a negative line');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($q$insert into public.access_requests (company, first_name, last_name, location, email) values ('Co', 'A', 'B', 'Graz', 'not-an-email')$q$, 'access_requests_input_limits'), 'an access request needs a real e-mail');
select pg_temp.check(pg_temp.fails(format($q$insert into public.access_requests (company, first_name, last_name, location, email) values (%L, 'A', 'B', 'Graz', 'a@b.at')$q$, repeat('c', 600)), 'access_requests_input_limits'), 'an access request with a 600 character company is refused');
insert into public.access_requests (company, first_name, last_name, location, email) values ('Fine Co', 'A', 'B', 'Graz', 'fine@co.at');
select pg_temp.as_user(:'admin');
select pg_temp.check(pg_temp.fails(format($q$select public.comment_lead(%L, %L)$q$, :'lead_anna', repeat('c', 5000)), 'lead_events_comment_limit'), 'a comment of 5000 characters is refused');


-- ---------- 22. speed of the access rules (0016): helpers once per statement, same answers ----------
select pg_temp.as_root();
select pg_temp.check(not exists (
  select 1 from pg_policy pol join pg_class r on r.oid = pol.polrelid join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
        ~ '(?<!SELECT )\m(auth\.uid|sees_all|my_role|my_org|is_superadmin|can_edit_projects)\(\)'), 'no policy calls a helper function once per row');
select pg_temp.check(not exists (
  select 1 from pg_policy pol where pg_get_expr(pol.polqual, pol.polrelid) like '%org_of(%'), 'the company check of a dealer is a single array, not org_of() per row');
select pg_temp.check(public.norm_phone('+43 660 112 020') = '660112020' and public.norm_phone('0660 112 020') = '660112020' and public.norm_phone('12-34') = '1234' and public.norm_phone('') is null and public.norm_phone(null) is null and public.norm_phone('abc') is null, 'norm_phone gives the same keys as before');
select pg_temp.check((select count(*) from pg_indexes where schemaname = 'public' and indexname in ('quotes_created', 'quotes_lead_created', 'quotes_owner_created', 'notifications_user_at', 'notifications_unread')) = 5, 'the list indexes exist');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($$select public.my_org_users()$$, 'permission denied'), 'the public site cannot call the company helper');

-- ---------- 23. dealer sends a project, the office checks, records the owner's consent and publishes (0017) ----------
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
select pg_temp.check((select title from public.projects where id = :'pj') = 'Bioklimatische Pergola, ' || to_char(now() at time zone 'Europe/Vienna', 'YYYY')
  and (select country || district || published::text || cardinality(photos) from public.projects where id = :'pj') = 'AT8010false0'
  and (select installed_on from public.projects where id = :'pj') = (now() at time zone 'Europe/Vienna')::date, 'the request is a draft filled from the order, the title carries no district');
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
select pg_temp.check(pg_temp.fails(format($q$insert into public.project_private (project_id, submitted_by) values (%L, %L)$q$, '00000000-0000-0000-0000-0000000000c2', :'graz1'), 'permission denied'), 'a dealer cannot insert into project_private');
select pg_temp.check(pg_temp.fails(format($q$update public.project_private set consent_at = now() where project_id = %L$q$, :'pj'), 'permission denied'), 'a dealer cannot grant consent to himself');
select pg_temp.check(pg_temp.fails(format($q$update public.project_private set dealer_note = 'x' where project_id = %L$q$, :'pj'), 'permission denied'), 'a dealer cannot edit project_private');
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

-- ---------- 23b. review round: office window on orders, confirmation by the office, photos, district, direct writes ----------
select pg_temp.as_root();
insert into public.orders (id, lead_id, stage) values ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000d1', 'done');  -- 'done' confirmed by a superdealer only
insert into public.orders (id, lead_id) values ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000d1');             -- the dealer sets 'done' himself
\set o_sd '00000000-0000-0000-0000-0000000000e6'
\set o_dl '00000000-0000-0000-0000-0000000000e7'
insert into public.lead_events (lead_id, order_id, by, kind, order_from, order_to)
  values ('00000000-0000-0000-0000-0000000000d1', :'o_sd', :'superdealer', 'stage', 'inbox', 'done');
select pg_temp.as_user(:'graz1');
update public.orders set stage = 'done' where id = :'o_dl';
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', true)$q$, :'o_sd'), 'NOT_INSTALLED'), 'a superdealer''s done does not count as the office''s confirmation');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_project(%L, 'n', true)$q$, :'o_dl'), 'NOT_INSTALLED'), 'a done set by the dealer does not count');
select pg_temp.check(pg_temp.fails($$select * from public.list_orders_for_installation()$$, 'FORBIDDEN'), 'a dealer cannot list orders for installation');
select pg_temp.as_user(:'superdealer');
select pg_temp.check(pg_temp.fails($$select * from public.list_orders_for_installation()$$, 'FORBIDDEN'), 'a superdealer cannot list orders for installation');
select pg_temp.as_user(:'manager');
-- 0012 lets a manager read NEW unassigned site requests (source 'web', no creator, no assignee): that is the only foreign lead he may see.
-- The dealers' leads of this section (and their orders) stay closed to him: the narrow list function is the only way to see them.
select pg_temp.check((select count(*) from public.leads where created_by is not null and created_by <> :'manager' and (assigned_to is distinct from :'manager')) = 0
  and (select count(*) from public.leads) = (select count(*) from public.leads where created_by = :'manager' or assigned_to = :'manager' or (source = 'web' and created_by is null and assigned_to is null)),
  'the manager sees no foreign dealer lead, only his own and the new unassigned site requests');
select pg_temp.check((select count(*) from public.orders where id in (:'o_inbox', :'o_self', :'o_sd', :'o_dl', :'o_ok', :'o_light', :'o_foreign')) = 0, 'the manager does not read the dealers'' orders directly');
select pg_temp.check((select count(*) from public.list_orders_for_installation() where order_id in (:'o_inbox', :'o_self', :'o_sd', :'o_dl')) = 4
  and (select needs_confirmation from public.list_orders_for_installation() where order_id = :'o_inbox') is false
  and (select bool_and(needs_confirmation) from public.list_orders_for_installation() where order_id in (:'o_self', :'o_sd', :'o_dl'))
  and (select contact_name || postcode from public.list_orders_for_installation() where order_id = :'o_inbox') = 'Order G18010',
  'the manager lists a dealer''s open orders and those whose done lacks the office''s confirmation');
select pg_temp.check((select count(*) from public.list_orders_for_installation() where order_id in (:'o_ok', :'o_light', :'o_foreign')) = 0, 'orders confirmed by the office are not listed');
-- order_read follows lead_read (0012): a manager reads the orders of the leads he may read, never a dealer's order through the listing
select pg_temp.check((select count(*) from public.orders where id in (:'o_inbox', :'o_self', :'o_sd', :'o_dl', :'o_ok', :'o_light', :'o_foreign')) = 0, 'the listing gives the manager no access to the orders table');
select public.complete_installation(:'o_dl');
select public.complete_installation(:'o_dl');
select public.complete_installation(:'o_sd');
select pg_temp.as_root();
select pg_temp.check((select count(*) from public.lead_events where order_id = :'o_dl' and order_to = 'done' and by = :'manager' and comment = 'installation confirmed by the office') = 1, 'confirming a done order adds one event, the second call adds none');
select pg_temp.check((select stage from public.orders where id = :'o_dl') = 'done', 'confirming does not change the stage');
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.list_orders_for_installation() where order_id in (:'o_dl', :'o_sd')) = 0, 'confirmed orders leave the listing');
select pg_temp.as_user(:'admin');
select pg_temp.check((select count(*) from public.list_orders_for_installation() where order_id = :'o_inbox') = 1, 'the superadmin lists orders too');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($$select * from public.list_orders_for_installation()$$, 'permission denied'), 'the public cannot list orders for installation');

-- the dealer's done, then the confirmation: the request passes; blank note becomes null; no district in the title
select pg_temp.as_user(:'graz1');
select public.submit_project(:'o_dl', '   ', true) as pj7 \gset
select public.submit_project(:'o_sd', 'ok', true) as pj6 \gset
select pg_temp.check((select dealer_note is null from public.project_private where project_id = :'pj7') and (select title not like '%8010%' from public.projects where id = :'pj7'), 'a blank note is stored as null');
-- photos: one list, only once, never empty
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, '{}')$q$, :'pj6'), 'TOO_FEW_PHOTOS'), 'an empty photo list is refused');
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, null)$q$, :'pj6'), 'TOO_FEW_PHOTOS'), 'a null photo list is refused');
select format('%s/%s.jpg', :'pj6', gen_random_uuid()) as ph6, format('%s/%s.jpg', :'pj7', gen_random_uuid()) as ph7, format('%s/%s.jpg', :'pj6', gen_random_uuid()) as ph6b \gset
select public.attach_photos(:'pj6', array[:'ph6']);
select public.attach_photos(:'pj7', array[:'ph7']);
select pg_temp.check(pg_temp.fails(format($q$select public.attach_photos(%L, array[%L])$q$, :'pj6', :'ph6b'), 'PROJECT_HAS_PHOTOS'), 'photos are accepted only while the list is empty');
select pg_temp.check((select photos from public.projects where id = :'pj6') = array[:'ph6'], 'the first list stays');
-- the district rule, both directions
select pg_temp.as_user(:'manager');
select public.record_consent(:'pj6', 'call', 'v1', false, false);
select public.record_consent(:'pj7', 'call', 'v1', true, true);
select pg_temp.check(pg_temp.fails(format($q$update public.projects set published = true, title = 'Pergola 8010', district = '8010' where id = %L$q$, :'pj6'), 'DISTRICT_NOT_ALLOWED'), 'without the district consent the district may not be in the title');
select pg_temp.check(pg_temp.fails(format($q$update public.projects set published = true, title = 'Pergola graz', district = 'GRAZ' where id = %L$q$, :'pj6'), 'DISTRICT_NOT_ALLOWED'), 'the district check ignores case');
update public.projects set published = true, title = 'Pergola, Steiermark', district = 'Graz' where id = :'pj6';
select pg_temp.check((select published from public.projects where id = :'pj6'), 'without the district consent a title without the district is published');
update public.projects set published = true, title = 'Pergola 8010' where id = :'pj7';
select pg_temp.check((select published from public.projects where id = :'pj7'), 'with the district consent the district may be in the title');
-- project_private is written by the functions only
select pg_temp.check(pg_temp.fails(format($q$update public.project_private set rejected_reason = null where project_id = %L$q$, :'pjl'), 'permission denied'), 'a manager cannot clear a rejection directly');
select pg_temp.check(pg_temp.fails(format($q$update public.project_private set consent_at = now() where project_id = %L$q$, :'pjl'), 'permission denied'), 'a manager cannot set a consent directly');
select pg_temp.check(pg_temp.fails($$insert into public.project_private (project_id) values ('00000000-0000-0000-0000-0000000000c5')$$, 'permission denied'), 'a manager cannot insert into project_private directly');
select pg_temp.as_user(:'admin');
select pg_temp.check(pg_temp.fails(format($q$update public.project_private set consent_at = now() where project_id = %L$q$, :'pjl'), 'permission denied'), 'not even the superadmin writes project_private directly');
-- a withdrawal must not collide with the same order sent again
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails(format($q$select public.unpublish_project(%L, null)$q$, :'pjl'), 'ALREADY_SUBMITTED'), 'unpublishing a rejected request while the order is sent again is refused cleanly');
-- the unique index itself (as owner, bypassing every function)
select pg_temp.as_root();
insert into public.projects (id, title, district, country) values ('00000000-0000-0000-0000-0000000000c9', '', '', 'AT');
select pg_temp.check(pg_temp.fails(format($q$insert into public.project_private (project_id, order_id) values ('00000000-0000-0000-0000-0000000000c9', %L)$q$, :'o_ok'), 'project_private_one_active_per_order'), 'the database itself allows one active project per order');
-- nobody but logged-in users reaches the functions
select pg_temp.check(not has_function_privilege('anon', f, 'execute'), 'anon cannot execute ' || f)
  from unnest(array['public.submit_project(uuid,text,boolean)', 'public.attach_photos(uuid,text[])', 'public.reject_project(uuid,text,text)',
    'public.unpublish_project(uuid,text)', 'public.record_consent(uuid,text,text,boolean,boolean)', 'public.complete_installation(uuid)',
    'public.list_orders_for_installation()', 'public.notify_managers(text,uuid,text)', 'public.order_installed_by_office(uuid)']) f;
select pg_temp.check(not has_function_privilege('authenticated', f, 'execute'), 'authenticated cannot execute ' || f)
  from unnest(array['public.notify_managers(text,uuid,text)', 'public.order_installed_by_office(uuid)']) f;

-- 0017 review round 2 (section 23): the district is public, so it is cleared without consent; caption matching by whole words
select pg_temp.as_root();
insert into public.projects (id, title, district, country, photos) values
  ('00000000-0000-0000-0000-0000000000ca', 'Villa in Wien-13.', 'Wien  13', 'AT', '{x/1.jpg}'),
  ('00000000-0000-0000-0000-0000000000cb', 'Ausblick', 'Au', 'AT', '{x/1.jpg}'),
  ('00000000-0000-0000-0000-0000000000cc', 'Pergola Steiermark', 'Graz', 'AT', '{x/1.jpg}');
insert into public.project_private (project_id, consent_at, consent_channel, consent_version, consent_district) values
  ('00000000-0000-0000-0000-0000000000ca', now(), 'call', 'v1', false),
  ('00000000-0000-0000-0000-0000000000cb', now(), 'call', 'v1', false),
  ('00000000-0000-0000-0000-0000000000cc', now(), 'call', 'v1', false);
select pg_temp.check(pg_temp.fails($$update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000ca'$$, 'DISTRICT_NOT_ALLOWED'), 'Wien 13 is caught in "Villa in Wien-13."');
update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000cb';
select pg_temp.check((select published from public.projects where id = '00000000-0000-0000-0000-0000000000cb'), 'Au does not block Ausblick');
update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000cc';
-- whole words at the START too: 'Ort' must not block "Fort" (a match inside a word)
insert into public.projects (id, title, district, country, photos) values ('00000000-0000-0000-0000-0000000000ce', 'Fort Pergola', 'Ort', 'AT', '{x/1.jpg}');
insert into public.project_private (project_id, consent_at, consent_channel, consent_version, consent_district) values ('00000000-0000-0000-0000-0000000000ce', now(), 'call', 'v1', false);
update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000ce';
select pg_temp.check((select published from public.projects where id = '00000000-0000-0000-0000-0000000000ce'), 'Ort does not block Fort (word boundary at the start)');
select pg_temp.as_anon();
select pg_temp.check((select district from public.projects where id = '00000000-0000-0000-0000-0000000000cc') = '', 'anon does not see the district of a project without the district consent');
select pg_temp.check((select district from public.projects where id = :'pj7') = '8010', 'with the district consent anon reads the district');
select pg_temp.as_root();
select pg_temp.check((select district from public.projects where id = '00000000-0000-0000-0000-0000000000c1') = 'Wien 13', 'the district with the consent is kept');
-- the postcode of the order in the title, without consent: pj for o_ok has the postcode 8010 and consent_district true there, so use a fresh order
insert into public.orders (id, lead_id, stage) values ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000d1', 'inbox');
insert into public.projects (id, title, district, country, photos) values ('00000000-0000-0000-0000-0000000000cd', 'Pergola 8010 Graz', '', 'AT', '{x/1.jpg}');
insert into public.project_private (project_id, order_id, consent_at, consent_channel, consent_version, consent_district)
  values ('00000000-0000-0000-0000-0000000000cd', '00000000-0000-0000-0000-0000000000e8', now(), 'call', 'v1', false);
select pg_temp.check(pg_temp.fails($$update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000cd'$$, 'DISTRICT_NOT_ALLOWED'), 'the postcode of the order in the title is refused without the district consent');
update public.projects set title = 'Pergola 80100' where id = '00000000-0000-0000-0000-0000000000cd';
update public.projects set published = true where id = '00000000-0000-0000-0000-0000000000cd';
select pg_temp.check((select published from public.projects where id = '00000000-0000-0000-0000-0000000000cd'), '8010 does not block 80100 (whole words)');

-- 0017: list_my_installed_orders and dealer_can_see_order
select pg_temp.as_root();
select pg_temp.check((select count(*) from public.project_private where order_id = :'o_light' and rejected_reason is null) = 1, 'fixture: o_light has an active second request');
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.list_my_installed_orders() where order_id in (:'o_inbox', :'o_foreign', :'o_ok', :'o_light', :'o_sd', :'o_dl')) = 0,
  'a dealer lists no foreign, unconfirmed, or already sent orders');
select pg_temp.as_root();
insert into public.orders (id, lead_id) values ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000d1');
\set o_new '00000000-0000-0000-0000-0000000000e9'
select pg_temp.as_user(:'graz1');
update public.orders set stage = 'done' where id = :'o_new';
select pg_temp.check((select count(*) from public.list_my_installed_orders() where order_id = :'o_new') = 0, 'an order the dealer set to done himself is not listed until the office confirms');
select pg_temp.as_user(:'manager');
select public.complete_installation(:'o_new');
select pg_temp.as_user(:'graz2');
select pg_temp.check((select count(*) from public.list_my_installed_orders() where order_id = :'o_new') = 1
  and (select contact_name || postcode from public.list_my_installed_orders() where order_id = :'o_new') = 'Order G18010', 'a confirmed order is listed (also for a colleague of the same company)');
select pg_temp.as_user(:'linz');
select pg_temp.check((select count(*) from public.list_my_installed_orders() where order_id = :'o_new') = 0, 'another dealer does not see it');
select pg_temp.as_user(:'graz1');
select public.submit_project(:'o_new', null, true) as pjn \gset
select pg_temp.check((select count(*) from public.list_my_installed_orders() where order_id = :'o_new') = 0, 'an active request hides the order');
select pg_temp.as_user(:'manager');
select public.reject_project(:'pjn', 'light', null);
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.list_my_installed_orders() where order_id = :'o_new') = 1, 'after a rejection for light the order is listed again');
select public.submit_project(:'o_new', null, true) as pjn2 \gset
select pg_temp.as_user(:'manager');
select public.record_consent(:'pjn2', 'call', 'v1', false, false);
select public.unpublish_project(:'pjn2', null);
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.list_my_installed_orders() where order_id = :'o_new') = 0, 'after a withdrawn consent the order is not listed');
select pg_temp.as_user(:'manager');
select pg_temp.check(pg_temp.fails($$select * from public.list_my_installed_orders()$$, 'FORBIDDEN'), 'a manager cannot list a dealer''s orders');
select pg_temp.as_user(:'superdealer');
select pg_temp.check(pg_temp.fails($$select * from public.list_my_installed_orders()$$, 'FORBIDDEN'), 'a superdealer cannot list a dealer''s orders');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($$select * from public.list_my_installed_orders()$$, 'permission denied'), 'the public cannot list orders');
select pg_temp.check(not has_function_privilege('anon', f, 'execute'), 'anon cannot execute ' || f)
  from unnest(array['public.list_my_installed_orders()', 'public.dealer_can_see_order(uuid)', 'public.norm_caption(text)', 'public.caption_has(text,text)']) f;
select pg_temp.check(not has_function_privilege('authenticated', f, 'execute'), 'authenticated cannot execute ' || f)
  from unnest(array['public.dealer_can_see_order(uuid)', 'public.norm_caption(text)', 'public.caption_has(text,text)']) f;

-- the helper behind the dealer's order list must agree with the real policy (order_read through lead_read) for every dealer:
-- same orders, whatever main changes in the rules of seeing leads
select pg_temp.as_root();
select set_config('request.jwt.claim.sub', :'graz1', false);
select coalesce(string_agg(id::text, ',' order by id), '') as h_graz1 from public.orders where public.dealer_can_see_order(id) \gset
select set_config('request.jwt.claim.sub', :'graz2', false);
select coalesce(string_agg(id::text, ',' order by id), '') as h_graz2 from public.orders where public.dealer_can_see_order(id) \gset
select set_config('request.jwt.claim.sub', :'linz', false);
select coalesce(string_agg(id::text, ',' order by id), '') as h_linz from public.orders where public.dealer_can_see_order(id) \gset
select pg_temp.as_user(:'graz1');
select coalesce(string_agg(id::text, ',' order by id), '') as r_graz1 from public.orders \gset
select pg_temp.as_user(:'graz2');
select coalesce(string_agg(id::text, ',' order by id), '') as r_graz2 from public.orders \gset
select pg_temp.as_user(:'linz');
select coalesce(string_agg(id::text, ',' order by id), '') as r_linz from public.orders \gset
select pg_temp.as_root();
select pg_temp.check(:'h_graz1' = :'r_graz1' and :'h_graz2' = :'r_graz2' and :'h_linz' = :'r_linz', 'dealer_can_see_order gives the same orders as the order_read policy for every dealer');
select pg_temp.check(length(:'r_graz1') > 0 and :'r_graz1' <> :'r_linz', 'the comparison is not vacuous: the dealers see different, non-empty sets of orders');

-- ---------- 0018: clean-up; 0019: callback request without a calculation ----------
select pg_temp.as_root();
select pg_temp.check((select title from public.discount_groups where code = 'agent') = 'Агенты', 'discount group agent is called Агенты');
select pg_temp.check(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosrc ~ '\mseller\M'), 'no function body mentions the old role label');
select pg_temp.check(not has_function_privilege('anon', 'public.submit_callback(jsonb,jsonb,text,boolean)', 'execute'), 'anon cannot call submit_callback');
select pg_temp.check(not has_function_privilege('authenticated', 'public.submit_callback(jsonb,jsonb,text,boolean)', 'execute'), 'authenticated cannot call submit_callback');
select pg_temp.check(has_function_privilege('service_role', 'public.submit_callback(jsonb,jsonb,text,boolean)', 'execute'), 'service_role may call submit_callback');
select count(*) as q_before from public.quotes \gset
select count(*) as n_before from public.notifications where kind = 'lead_new' \gset
select pg_temp.as_service();
select public.submit_callback('{"name":"  Rita Call ","phone":"+43 660 7001","email":"","address":"  ","postcode":"8020","note":""}', '{"utm_source":"g"}', '  ', true);
select pg_temp.as_root();
select pg_temp.check((select count(*) from public.leads where contact_name = 'Rita Call' and source = 'web' and phone = '+43 660 7001' and email is null
  and object_address is null and note is null and journey is null and postcode = '8020' and created_by is null and utm ->> 'utm_source' = 'g') = 1, 'callback creates a web lead, empty strings become null');
select pg_temp.check((select count(*) from public.quotes) = :q_before, 'a callback creates no quote');
select pg_temp.check((select count(*) from public.notifications where kind = 'lead_new') = :n_before + 1, 'superadmin is notified of a callback');
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.leads where contact_name = 'Rita Call') = 1, 'a manager sees the new unassigned web callback (0012)');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($q$select public.submit_callback('{"phone":"+43 1"}')$q$, 'permission denied'), 'anon call of submit_callback is refused');
select pg_temp.as_user(:'admin');
select pg_temp.check(pg_temp.fails($q$select public.submit_callback('{"phone":"+43 1"}')$q$, 'permission denied'), 'authenticated call of submit_callback is refused');
select pg_temp.as_service();
select pg_temp.check(pg_temp.fails($q$select public.submit_callback('{"name":"x"}', '{}', null, true)$q$, 'CONTACT_REQUIRED'), 'callback needs a phone or an e-mail');
select pg_temp.check(pg_temp.fails($q$select public.submit_callback('{"phone":" ","email":" "}', '{}', null, true)$q$, 'CONTACT_REQUIRED'), 'blank contact is no contact');
select public.submit_callback('{"email":"Limit@X.at"}', '{}', null, true);
select public.submit_callback('{"email":"limit@x.at"}', '{}', null, true);
select public.submit_callback('{"email":"LIMIT@x.at"}', '{}', null, true);
select public.submit_callback('{"email":"limit@x.at"}', '{}', null, true);
select public.submit_callback('{"email":"limit@x.at"}', '{}', null, true);
select pg_temp.check(pg_temp.fails($q$select public.submit_callback('{"email":"limit@x.at"}', '{}', null, true)$q$, 'TOO_MANY_REQUESTS'), 'the sixth callback in a day is refused');
select pg_temp.check(pg_temp.fails(format($q$select public.submit_callback(jsonb_build_object('phone', '+43 660 7002', 'name', %L), '{}', null, true)$q$, repeat('x', 5000)), 'leads_input_limits'), 'callback keeps the input limits of 0015');
select pg_temp.check(pg_temp.fails($q$select public.submit_callback('{"phone":"+43 660 7003"}')$q$, 'CONSENT_REQUIRED'), 'callback without consent (default) is refused');
select pg_temp.check(pg_temp.fails($q$select public.submit_callback('{"phone":"+43 660 7003"}', '{}', null, false)$q$, 'CONSENT_REQUIRED'), 'callback with consent false is refused');
select pg_temp.check(pg_temp.fails($q$select public.submit_callback('{"phone":"+43 660 7003"}', '{}', null, null)$q$, 'CONSENT_REQUIRED'), 'callback with consent null is refused');
select pg_temp.as_root();
select pg_temp.check(not exists (select 1 from public.leads where phone = '+43 660 7003'), 'a refused callback leaves no lead');
select pg_temp.check((select consent_at from public.leads where contact_name = 'Rita Call') between now() - interval '1 minute' and now(), 'consent date is recorded with the callback');
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(consent_at) from public.leads where contact_name = 'Rita Call') = 1, 'a manager who sees the lead sees its consent date');
select pg_temp.check(pg_temp.fails($q$update public.leads set consent_at = null where contact_name = 'Rita Call'$q$, 'permission denied'), 'a manager cannot change consent_at');
select pg_temp.as_user(:'admin');
select pg_temp.check(pg_temp.fails($q$update public.leads set consent_at = now()$q$, 'permission denied'), 'a superadmin cannot change consent_at directly');
select pg_temp.check(pg_temp.fails($q$insert into public.leads (contact_name, phone, consent_at) values ('Fake', '+43 1', now())$q$, 'permission denied'), 'a client cannot insert consent_at directly');
select pg_temp.as_root();

-- ---------- 0020: links of the internal tool (app_links) ----------
select pg_temp.as_user(:'admin');
insert into public.app_links (key, title, url) values ('gallery', 'Galerie', 'https://drive.google.com/drive/folders/test');
select pg_temp.as_root();
select pg_temp.check((select updated_by from public.app_links where key = 'gallery') = :'admin'::uuid and (select updated_at from public.app_links where key = 'gallery') > now() - interval '1 minute', 'the trigger sets updated_by and updated_at on insert');
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails($q$select * from public.app_links$q$, 'permission denied'), 'anon cannot read app_links');
select pg_temp.as_user(:'client');
select pg_temp.check((select count(*) from public.app_links) = 0, 'a client sees no app_links');
select pg_temp.as_user(:'graz1');
select pg_temp.check((select count(*) from public.app_links) = 1, 'a dealer reads app_links');
select pg_temp.as_user(:'superdealer');
select pg_temp.check((select count(*) from public.app_links) = 1, 'a superdealer reads app_links');
select pg_temp.as_user(:'manager');
select pg_temp.check((select count(*) from public.app_links) = 1, 'a manager reads app_links');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('x1', 'X', 'https://drive.google.com/a')$q$, 'row-level security'), 'a manager cannot insert app_links');
update public.app_links set title = 'Hacked';
delete from public.app_links;
select pg_temp.as_root();
select pg_temp.check((select title from public.app_links where key = 'gallery') = 'Galerie', 'a manager cannot update or delete app_links');
select pg_temp.as_user(:'graz1');
update public.app_links set title = 'Hacked';
delete from public.app_links;
select pg_temp.as_root();
select pg_temp.check((select title from public.app_links where key = 'gallery') = 'Galerie', 'a dealer cannot update or delete app_links');
select pg_temp.as_user(:'client');
update public.app_links set title = 'Hacked';
delete from public.app_links;
select pg_temp.as_root();
select pg_temp.check((select count(*) from public.app_links where title = 'Galerie') = 1, 'a client cannot update or delete app_links');
select pg_temp.as_user(:'admin');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('bad1', 'X', 'http://drive.google.com/a')$q$, 'app_links_url_check'), 'http:// url is refused');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('bad2', 'X', 'https://evil.example.com/a')$q$, 'app_links_url_check'), 'foreign domain is refused');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('bad3', 'X', 'https://drive.google.com/a b')$q$, 'app_links_url_check'), 'url with a space is refused');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('bad4', 'X', 'javascript:alert(1)')$q$, 'app_links_url_check'), 'javascript: url is refused');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('bad5', 'X', 'https://drive.google.com.evil.com/a')$q$, 'app_links_url_check'), 'look-alike domain is refused');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('bad6', 'X', 'https://drive.google.com/' || repeat('a', 500))$q$, 'app_links_url_check'), 'url over 500 characters is refused');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('Bad', 'X', 'https://drive.google.com/a')$q$, 'app_links_key_check'), 'bad key is refused');
select pg_temp.check(pg_temp.fails($q$insert into public.app_links (key, title, url) values ('bad7', '   ', 'https://drive.google.com/a')$q$, 'app_links_title_check'), 'blank title is refused');
insert into public.app_links (key, title, url) values ('ok2', 'Docs', 'https://docs.google.com/document/d/1');
delete from public.app_links where key = 'ok2';
select pg_temp.check(pg_temp.fails(format($q$insert into public.app_links (key, title, url, updated_by) values ('bad9', 'X', 'https://docs.google.com/a', %L)$q$, :'client'), 'permission denied'), 'updated_by cannot be written directly');
select pg_temp.check(pg_temp.fails(format($q$update public.app_links set updated_by = %L$q$, :'client'), 'permission denied'), 'updated_by cannot be updated directly');
select pg_temp.check(pg_temp.fails($q$update public.app_links set updated_at = '2000-01-01'$q$, 'permission denied'), 'updated_at cannot be written directly');
update public.app_links set title = 'Galerie 2', url = 'https://photos.app.goo.gl/x' where key = 'gallery';
select pg_temp.as_root();
select pg_temp.check((select title from public.app_links where key = 'gallery') = 'Galerie 2' and (select updated_by from public.app_links where key = 'gallery') = :'admin'::uuid, 'the superadmin updates a link; updated_by is the superadmin');
select pg_temp.as_user(:'admin');
delete from public.app_links where key = 'gallery';
select pg_temp.as_root();
select pg_temp.check((select count(*) from public.app_links) = 0, 'the superadmin deletes a link');

select 'access tests passed' as result;
