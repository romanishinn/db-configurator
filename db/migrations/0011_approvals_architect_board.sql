-- 1. Approval of a discount above the personal limit (replaces the hard refusal for staff)
-- 2. The architect works with his own projects only (what he entered himself and his own quotes)
-- 3. lead_board rebuilt so that it carries the columns added to leads after it was created (score, next_action)
-- 4. Trigger functions are not callable from the public API
-- Written without the names "seller" / "manager": the live database calls that role "manager", a fresh rebuild "seller".

-- ---------- 1. approvals ----------
-- true when some discount of the quote is above the owner's personal limit (a superadmin has no limit)
create or replace function public.quote_over_limit(p_owner uuid, p_discount jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(bool_or((e.value)::numeric > coalesce(p.discount_limit, 0)), false)
  from public.profiles p, jsonb_each_text(coalesce(p_discount, '{}'::jsonb)) as e(key, value)
  where p.id = p_owner and p.role <> 'superadmin'
$$;
revoke all on function public.quote_over_limit(uuid, jsonb) from public, anon, authenticated;

-- one row per quote that waits for / got a decision (a quote within the limit has no row)
create table public.quote_approvals (
  quote_id uuid primary key references public.quotes (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  constraint approval_decided check (status = 'pending' or (decided_by is not null and decided_at is not null))
);
alter table public.quote_approvals enable row level security;
-- the superadmin / superdealer see all, the owner of the quote sees his own
create policy approval_read on public.quote_approvals for select to authenticated using (
  public.sees_all() or exists (select 1 from public.quotes q where q.id = quote_approvals.quote_id and q.owner = auth.uid())
);
grant select on public.quote_approvals to authenticated;   -- written only by the trigger and decide_approval

-- the quote guard: a client still cannot give a discount; staff above the limit go to approval instead of an error
create or replace function public.quotes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_role; lim numeric; d jsonb; k text; base text; fam integer;
begin
  if tg_op = 'INSERT' then
    if new.revises is not null then
      select split_part(q.number, '.', 1) into base from public.quotes q where q.id = new.revises;
      if base is null then
        new.number := public.next_quote_no();
      else
        select count(*) into fam from public.quotes where number = base or number like base || '.%';
        new.number := base || '.' || (fam + 1);
      end if;
    else
      new.number := public.next_quote_no();
    end if;
    new.created_at := now();
    new.valid_until := (now() at time zone 'Europe/Vienna')::date + 14;
  end if;
  if new.owner is null then return new; end if;
  select role, discount_limit into r, lim from public.profiles where id = new.owner;
  if tg_op = 'INSERT' and r = 'client'
     and (select count(*) from public.quotes where owner = new.owner) >= 3 then
    raise exception 'QUOTE_LIMIT: a client can keep at most 3 calculations' using errcode = 'P0001';
  end if;
  d := coalesce(new.discount, '{}'::jsonb);
  for k in select jsonb_object_keys(d) loop
    if k not in ('pergola', 'sides', 'extras') then
      raise exception 'DISCOUNT_SCOPE: discount only on pergola, sides (constructions) and text positions' using errcode = 'P0001';
    end if;
    if (d ->> k)::numeric < 0 then
      raise exception 'DISCOUNT_LIMIT: a discount cannot be negative' using errcode = 'P0001';
    end if;
    if r = 'client' and (d ->> k)::numeric > coalesce(lim, 0) then
      raise exception 'DISCOUNT_LIMIT: % %% is above the personal limit of % %%', d ->> k, coalesce(lim, 0) using errcode = 'P0001';
    end if;
  end loop;
  return new;      -- staff above the limit: the quote is saved and quotes_request_approval queues it
end $$;

create or replace function public.quotes_request_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner is not null and public.quote_over_limit(new.owner, new.discount) then
    insert into public.quote_approvals (quote_id) values (new.id);
    perform public.notify_superadmins('approval', new.lead_id, 'Скидка выше лимита, нужно утверждение: КП ' || new.number);
  end if;
  return null;
end $$;
revoke all on function public.quotes_request_approval() from public, anon, authenticated;
drop trigger if exists quotes_request_approval on public.quotes;
create trigger quotes_request_approval after insert on public.quotes
  for each row execute function public.quotes_request_approval();

create or replace function public.decide_approval(p_quote uuid, p_approve boolean, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
declare q public.quotes;
begin
  if not public.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not p_approve and length(btrim(coalesce(p_comment, ''))) = 0 then raise exception 'COMMENT_REQUIRED' using errcode = 'P0001'; end if;
  update public.quote_approvals
     set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), comment = p_comment
   where quote_id = p_quote and status = 'pending';
  if not found then raise exception 'NO_PENDING_APPROVAL' using errcode = 'P0001'; end if;
  select * into q from public.quotes where id = p_quote;
  if q.owner is not null then
    insert into public.notifications (user_id, kind, lead_id, text)
    values (q.owner, 'approval', q.lead_id, case when p_approve then 'Скидка утверждена: КП ' || q.number else 'Скидка отклонена: КП ' || q.number || coalesce(' — ' || p_comment, '') end);
  end if;
  if q.lead_id is not null then
    insert into public.lead_events (lead_id, by, kind, comment)
    values (q.lead_id, auth.uid(), 'comment', case when p_approve then 'Скидка по КП ' || q.number || ' утверждена' else 'Скидка по КП ' || q.number || ' отклонена: ' || p_comment end);
  end if;
end $$;
revoke all on function public.decide_approval(uuid, boolean, text) from public, anon;
grant execute on function public.decide_approval(uuid, boolean, text) to authenticated;

-- ---------- 2. architect: his own projects ----------
-- Added next to the existing policies (policies of one kind are alternatives), so nothing else changes.
-- He already reads what he created (lead_read: created_by = me) and his own quotes (quote_read: owner = me).
create policy lead_insert_architect on public.leads for insert to authenticated
  with check (created_by = auth.uid() and public.my_role() = 'architect');
create policy lead_update_architect on public.leads for update to authenticated
  using (created_by = auth.uid() and public.my_role() = 'architect');

-- ---------- 3. lead_board: take the new columns of leads ----------
drop view if exists public.lead_board;
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

-- ---------- 4. trigger functions must not be callable through the API ----------
do $$
declare f text;
begin
  foreach f in array array['lead_events_apply_score()', 'lead_events_set_score()', 'leads_after_update()', 'leads_make_order()', 'orders_log_stage()']
  loop
    if to_regprocedure('public.' || f) is not null then
      execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    end if;
  end loop;
end $$;
