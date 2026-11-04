-- Configurable stages of the sales pipeline (the owner sets how many and how they are called in the settings).
-- A lead has a position `col` (0 = first stage); the last stage is always the outcome (order / lost), which keeps its
-- automatics: it is decided by leads.stage = won / lost, as before. Open leads are read at least(col, last open stage), so
-- shortening the pipeline loses nothing: the leads wait in the last open stage and come back if it grows again.
-- ASSUMPTION: the filter "waiting for the client" is every open lead from the third stage on.
-- No role names in this file.

-- ---------- 1. the stages ----------
create table public.pipeline_stages (
  pos smallint primary key check (pos between 0 and 6),
  title text not null check (length(btrim(title)) between 1 and 40)
);
insert into public.pipeline_stages (pos, title) values (0, 'Новый'), (1, 'В работе'), (2, 'Предложение'), (3, 'Переговоры'), (4, 'Итог');
alter table public.pipeline_stages enable row level security;
create policy pipeline_read on public.pipeline_stages for select to authenticated using (coalesce((select public.my_role()) <> 'client', false));
revoke all on public.pipeline_stages from anon, authenticated;
grant select on public.pipeline_stages to authenticated;

-- only the superadmin, only through this function: 2 to 7 stages, the last one is the outcome
create or replace function public.set_pipeline(p_titles text[]) returns void
language plpgsql security definer set search_path = public as $$
declare n int := coalesce(array_length(p_titles, 1), 0); i int; t text;
begin
  if not public.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if n < 2 or n > 7 then raise exception 'PIPELINE_SIZE: 2 to 7 stages' using errcode = '22023'; end if;
  for i in 1 .. n loop
    t := btrim(coalesce(p_titles[i], ''));
    if length(t) < 1 or length(t) > 40 then raise exception 'PIPELINE_TITLE: 1 to 40 characters' using errcode = '22023'; end if;
  end loop;
  delete from public.pipeline_stages where true;
  for i in 1 .. n loop insert into public.pipeline_stages (pos, title) values (i - 1, btrim(p_titles[i])); end loop;
end $$;
revoke all on function public.set_pipeline(text[]) from public, anon;
grant execute on function public.set_pipeline(text[]) to authenticated;

-- ---------- 2. the position of a lead ----------
alter table public.leads add column col smallint not null default 0 check (col between 0 and 6);
update public.leads set col = case stage
  when 'new' then 0
  when 'contacted' then 1 when 'processing' then 1 when 'visit_agreed' then 1 when 'consultation' then 1 when 'measured' then 1
  when 'quote_issued' then 2 when 'proposal' then 2
  when 'negotiation' then 3
  else 0 end;
grant update (col) on public.leads to authenticated;
create index leads_col on public.leads (col) where stage not in ('won', 'lost');

-- Two ways to move an open lead, one result. The CRM changes only the position and the stage follows it (so the older
-- staff cabinet and the rule "managers read new site requests" keep working); the older stage buttons change only the
-- stage and the position follows it.
create or replace function public.leads_sync_col() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.stage in ('won', 'lost') and new.stage not in ('won', 'lost') and new.col is not distinct from old.col then   -- reopened: the position follows the stage
    new.col := case new.stage when 'new' then 0 when 'contacted' then 1 when 'processing' then 1 when 'visit_agreed' then 1 when 'consultation' then 1 when 'measured' then 1 when 'quote_issued' then 2 when 'proposal' then 2 else 3 end;
    return new;
  end if;
  if new.stage in ('won', 'lost') or old.stage in ('won', 'lost') then return new; end if;
  if new.col is distinct from old.col and new.stage is not distinct from old.stage then
    new.stage := case when new.col = 0 then 'new' when new.col = 1 then 'contacted' when new.col = 2 then 'quote_issued' else 'negotiation' end;
    perform set_config('crm.move', new.id::text, true);   -- read by the history trigger below: this is a move between stages
  elsif new.stage is distinct from old.stage and new.col is not distinct from old.col then
    new.col := case new.stage
      when 'new' then 0
      when 'contacted' then 1 when 'processing' then 1 when 'visit_agreed' then 1 when 'consultation' then 1 when 'measured' then 1
      when 'quote_issued' then 2 when 'proposal' then 2
      else 3 end;
  end if;
  return new;
end $$;
revoke all on function public.leads_sync_col() from public, anon, authenticated;
create trigger leads_sync_col before update on public.leads for each row execute function public.leads_sync_col();

-- ---------- 3. history: a move between stages of the pipeline ----------
alter table public.lead_events drop constraint lead_events_kind_check;
alter table public.lead_events add constraint lead_events_kind_check check (kind in ('created', 'assigned', 'transferred', 'stage', 'comment', 'quote', 'step'));
create or replace function public.lead_events_set_score() returns trigger
language plpgsql as $$
begin
  if new.score_delta = 0 then
    new.score_delta := case new.kind
      when 'quote'       then 10
      when 'stage'       then 5
      when 'step'        then 5
      when 'comment'     then 2
      when 'assigned'    then 2
      when 'transferred' then 1
      else 0 end;
  end if;
  return new;
end $$;
create or replace function public.leads_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text; b text;
begin
  if coalesce(current_setting('crm.move', true), '') = new.id::text and new.col is distinct from old.col then
    perform set_config('crm.move', '', true);
    select title into a from public.pipeline_stages where pos = least(old.col, (select count(*) - 2 from public.pipeline_stages));
    select title into b from public.pipeline_stages where pos = least(new.col, (select count(*) - 2 from public.pipeline_stages));
    if a is distinct from b then
      insert into public.lead_events (lead_id, by, kind, comment) values (new.id, auth.uid(), 'step', coalesce(a, '?') || ' → ' || coalesce(b, '?'));
    end if;
  elsif new.stage is distinct from old.stage then
    insert into public.lead_events (lead_id, by, kind, from_stage, to_stage, comment)
    values (new.id, auth.uid(), 'stage', old.stage, new.stage, case when new.stage = 'lost' then new.lost_reason end);
  end if;
  return new;
end $$;
revoke all on function public.leads_after_update() from public, anon, authenticated;

-- ---------- 4. the board view carries the new column; the lists and counters read the position ----------
drop function public.lead_page(text, text, integer, integer);
drop view public.lead_board;
create view public.lead_board with (security_invoker = true) as
select l.*,
       p.full_name as assignee_name, p.role as assignee_role, o.name as assignee_org,
       (l.stage not in ('won', 'lost') and l.last_activity_at < now() - interval '7 days') as stale,
       q.number as last_quote, q.total_net as last_total_net, q.approval as last_quote_approval
from public.leads l
left join public.profiles p on p.id = l.assigned_to
left join public.organizations o on o.id = p.org_id
left join lateral (
  select qq.number, qq.total_net, a.status as approval
  from public.quotes qq left join public.quote_approvals a on a.quote_id = qq.id
  where qq.lead_id = l.id order by qq.created_at desc limit 1
) q on true;
grant select on public.lead_board to authenticated;

-- p_chip: open | need | late | wait | all | won | lost   (Today filters)
--         c0 .. c5   the open stages by position, c6 the outcome (won / lost)
create or replace function public.lead_page(p_chip text default 'open', p_q text default null, p_limit integer default 40, p_offset integer default 0)
returns setof public.lead_board
language sql stable security invoker set search_path = public as $$
  with p as (
    select (now() at time zone 'Europe/Vienna')::date as d, (select count(*)::int from public.pipeline_stages) as n,
           nullif(btrim(coalesce(p_q, '')), '') as q,
           regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g') as digits
  )
  select b.*
  from public.lead_board b, p
  where case p_chip
      when 'all'  then true
      when 'open' then b.stage not in ('won', 'lost')
      when 'need' then b.stage not in ('won', 'lost') and (b.assigned_to is null or b.assigned_to = auth.uid())
                       and (b.next_action_at <= p.d or least(b.col, p.n - 2) = 0)
      when 'late' then b.stage not in ('won', 'lost') and b.next_action_at < p.d
      when 'wait' then b.stage not in ('won', 'lost') and least(b.col, p.n - 2) >= 2 and (b.next_action_at is null or b.next_action_at > p.d)
      when 'won'  then b.stage = 'won'
      when 'lost' then b.stage = 'lost'
      when 'c0'   then b.stage not in ('won', 'lost') and least(b.col, p.n - 2) = 0
      when 'c1'   then b.stage not in ('won', 'lost') and least(b.col, p.n - 2) = 1
      when 'c2'   then b.stage not in ('won', 'lost') and least(b.col, p.n - 2) = 2
      when 'c3'   then b.stage not in ('won', 'lost') and least(b.col, p.n - 2) = 3
      when 'c4'   then b.stage not in ('won', 'lost') and least(b.col, p.n - 2) = 4
      when 'c5'   then b.stage not in ('won', 'lost') and least(b.col, p.n - 2) = 5
      when 'c6'   then b.stage in ('won', 'lost')
      else false end
    and (p.q is null
         or b.contact_name ilike '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or b.email        ilike '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or b.object_address ilike '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or b.note         ilike '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or b.last_quote   ilike '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or (length(p.digits) >= 3 and public.norm_phone(b.phone) like '%' || right(p.digits, 9) || '%'))
  order by case when p_chip in ('need', 'late') then b.next_action_at end asc nulls last, b.last_activity_at desc, b.id desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;


drop function public.lead_counts();
create function public.lead_counts()
returns table (need bigint, late bigint, wait bigint, "open" bigint, won bigint, lost bigint, unassigned bigint, c0 bigint, c1 bigint, c2 bigint, c3 bigint, c4 bigint, c5 bigint)
language sql stable security invoker set search_path = public as $$
  with p as (select (now() at time zone 'Europe/Vienna')::date as d, (select count(*)::int from public.pipeline_stages) as n),
  x as (select l.*, least(l.col, p.n - 2) as c, p.d from public.leads l, p)
  select count(*) filter (where stage not in ('won', 'lost') and (assigned_to is null or assigned_to = auth.uid()) and (next_action_at <= d or c = 0)),
         count(*) filter (where stage not in ('won', 'lost') and next_action_at < d),
         count(*) filter (where stage not in ('won', 'lost') and c >= 2 and (next_action_at is null or next_action_at > d)),
         count(*) filter (where stage not in ('won', 'lost')),
         count(*) filter (where stage = 'won'),
         count(*) filter (where stage = 'lost'),
         count(*) filter (where stage not in ('won', 'lost') and assigned_to is null),
         count(*) filter (where stage not in ('won', 'lost') and c = 0),
         count(*) filter (where stage not in ('won', 'lost') and c = 1),
         count(*) filter (where stage not in ('won', 'lost') and c = 2),
         count(*) filter (where stage not in ('won', 'lost') and c = 3),
         count(*) filter (where stage not in ('won', 'lost') and c = 4),
         count(*) filter (where stage not in ('won', 'lost') and c = 5)
  from x
$$;
revoke all on function public.lead_page(text, text, integer, integer), public.lead_counts() from public, anon;
grant execute on function public.lead_page(text, text, integer, integer), public.lead_counts() to authenticated;
