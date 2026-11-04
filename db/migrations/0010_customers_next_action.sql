-- CRM: "what to do next" text on a lead, and a customer = every lead of the same person (no extra table).
-- A person is recognised by the last 9 digits of the phone (so "+43 660 112 020", "0660 112 020" and
-- "0043 660 112 020" are one customer), else by the e-mail. The view runs with the caller's rights
-- (security_invoker), so who sees which customer is exactly who sees the leads (row level security).

alter table public.leads add column if not exists next_action text;  -- what to do at next_action_at ("Позвонить, спросить про сроки")

grant insert (next_action) on public.leads to authenticated;
grant update (next_action) on public.leads to authenticated;

create or replace function public.norm_phone(p text) returns text
language sql immutable as $$
  select case when length(d) >= 9 then right(d, 9) else nullif(d, '') end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) t
$$;
grant execute on function public.norm_phone(text) to authenticated;

create index if not exists leads_phone_norm on public.leads (public.norm_phone(phone));
create index if not exists leads_email_norm on public.leads (lower(email));

create or replace view public.customers with (security_invoker = true) as
select coalesce(public.norm_phone(phone), lower(email)) as key,
       (array_agg(contact_name order by created_at desc))[1] as name,
       (array_agg(phone order by created_at desc))[1] as phone,
       (array_agg(email order by created_at desc))[1] as email,
       (array_agg(object_address order by created_at desc))[1] as object_address,
       (array_agg(id order by created_at desc))[1] as last_lead_id,
       count(*)::int as leads,
       (count(*) filter (where stage = 'won'))::int as won,
       max(last_activity_at) as last_activity_at
from public.leads
where coalesce(public.norm_phone(phone), lower(email)) is not null
group by 1;
grant select on public.customers to authenticated;
