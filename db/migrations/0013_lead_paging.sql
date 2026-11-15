-- The CRM no longer loads every lead: a page of leads, the counters of the filters and the statistics come from the
-- database. All three run with the caller's rights (security invoker), so row level security decides what is counted.
-- No role names in this file (the sales role is "manager" live and "seller" in older rebuilds).

-- the order the lists are read in, and the filters of the boards
create index if not exists leads_activity on public.leads (last_activity_at desc, id desc);
create index if not exists leads_next_action on public.leads (next_action_at) where next_action_at is not null;

-- ---------- one page of leads ----------
-- p_chip: open | need | late | wait | all | won | lost   (Today filters)
--         c0 .. c4                                       (board columns: new / in work / proposal / negotiation / outcome)
-- p_q: text in the name, e-mail, address, note, quote number, or digits of the phone (any format)
create or replace function public.lead_page(p_chip text default 'open', p_q text default null, p_limit integer default 40, p_offset integer default 0)
returns setof public.lead_board
language sql stable security invoker set search_path = public as $$
  with p as (
    select (now() at time zone 'Europe/Vienna')::date as d,
           nullif(btrim(coalesce(p_q, '')), '') as q,
           regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g') as digits
  )
  select b.*
  from public.lead_board b, p
  where case p_chip
      when 'all'  then true
      when 'open' then b.stage not in ('won', 'lost')
      when 'need' then b.stage not in ('won', 'lost') and (b.assigned_to is null or b.assigned_to = auth.uid())
                       and (b.next_action_at <= p.d or b.stage = 'new')
      when 'late' then b.stage not in ('won', 'lost') and b.next_action_at < p.d
      when 'wait' then b.stage in ('quote_issued', 'proposal', 'negotiation') and (b.next_action_at is null or b.next_action_at > p.d)
      when 'won'  then b.stage = 'won'
      when 'lost' then b.stage = 'lost'
      when 'c0'   then b.stage = 'new'
      when 'c1'   then b.stage in ('contacted', 'processing', 'visit_agreed', 'consultation', 'measured')
      when 'c2'   then b.stage in ('quote_issued', 'proposal')
      when 'c3'   then b.stage = 'negotiation'
      when 'c4'   then b.stage in ('won', 'lost')
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

-- ---------- the numbers on the filter chips and board columns ----------
create or replace function public.lead_counts()
returns table (need bigint, late bigint, wait bigint, "open" bigint, won bigint, lost bigint, unassigned bigint, c0 bigint, c1 bigint, c2 bigint, c3 bigint)
language sql stable security invoker set search_path = public as $$
  with p as (select (now() at time zone 'Europe/Vienna')::date as d)
  select count(*) filter (where l.stage not in ('won', 'lost') and (l.assigned_to is null or l.assigned_to = auth.uid()) and (l.next_action_at <= p.d or l.stage = 'new')),
         count(*) filter (where l.stage not in ('won', 'lost') and l.next_action_at < p.d),
         count(*) filter (where l.stage in ('quote_issued', 'proposal', 'negotiation') and (l.next_action_at is null or l.next_action_at > p.d)),
         count(*) filter (where l.stage not in ('won', 'lost')),
         count(*) filter (where l.stage = 'won'),
         count(*) filter (where l.stage = 'lost'),
         count(*) filter (where l.stage not in ('won', 'lost') and l.assigned_to is null),
         count(*) filter (where l.stage = 'new'),
         count(*) filter (where l.stage in ('contacted', 'processing', 'visit_agreed', 'consultation', 'measured')),
         count(*) filter (where l.stage in ('quote_issued', 'proposal')),
         count(*) filter (where l.stage = 'negotiation')
  from public.leads l, p
$$;

-- ---------- the overview screen: totals, per employee, per source ----------
create or replace function public.crm_stats() returns jsonb
language sql stable security invoker set search_path = public as $$
  with p as (select (now() at time zone 'Europe/Vienna')::date as d),
  x as (
    select l.id, l.stage, l.assigned_to, l.next_action_at, coalesce(nullif(l.utm ->> 'source', ''), l.source) as src, q.total_net
    from public.leads l
    left join lateral (select total_net from public.quotes where lead_id = l.id order by created_at desc limit 1) q on true
  )
  select jsonb_build_object(
    'open',       count(*) filter (where stage not in ('won', 'lost')),
    'pipeline',   coalesce(sum(total_net) filter (where stage not in ('won', 'lost')), 0),
    'won',        count(*) filter (where stage = 'won'),
    'lost',       count(*) filter (where stage = 'lost'),
    'avg_won',    avg(total_net) filter (where stage = 'won' and total_net is not null),
    'unassigned', count(*) filter (where stage not in ('won', 'lost') and assigned_to is null),
    'by_user',    coalesce((select jsonb_agg(u) from (
                    select assigned_to as id, count(*) as n,
                           count(*) filter (where stage not in ('won', 'lost')) as open,
                           coalesce(sum(total_net) filter (where stage not in ('won', 'lost')), 0) as sum,
                           count(*) filter (where stage not in ('won', 'lost') and next_action_at < (select d from p)) as late,
                           count(*) filter (where stage = 'won') as won,
                           count(*) filter (where stage = 'lost') as lost
                    from x where assigned_to is not null group by assigned_to) u), '[]'::jsonb),
    'by_source',  coalesce((select jsonb_agg(s) from (select src as k, count(*) as n from x group by src order by count(*) desc limit 30) s), '[]'::jsonb)
  ) from x
$$;

revoke all on function public.lead_page(text, text, integer, integer), public.lead_counts(), public.crm_stats() from public, anon;
grant execute on function public.lead_page(text, text, integer, integer), public.lead_counts(), public.crm_stats() to authenticated;

-- An architect works on the projects he entered himself (lead_update_architect, 0011): "may edit this lead" of 0012 has to
-- say so too, or his quotes and orders on his own project would be refused. Same function, one more role in the creator line.
create or replace function public.can_edit_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l where l.id = p_lead and (
      public.sees_all()
      or l.assigned_to = auth.uid()
      or (l.created_by = auth.uid() and public.my_role() in ('manager', 'dealer', 'architect'))
      or (public.my_role() = 'dealer' and public.my_org() is not null and public.org_of(l.assigned_to) = public.my_org())
    )
  )
$$;
