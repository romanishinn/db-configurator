-- Limits on what anyone may write (security review): the public request form and the access request form are open to
-- anonymous visitors, so a field must not take 100 KB, an e-mail must look like one, and a quote must not carry a
-- negative line (a price cut hidden in the lines) unless the superadmin made it.
-- No role names in this file.

-- leads (the request form of the website and the CRM)
alter table public.leads add constraint leads_input_limits check (
  length(coalesce(contact_name, '')) <= 200 and length(coalesce(phone, '')) <= 40 and length(coalesce(email, '')) <= 254
  and length(coalesce(object_address, '')) <= 300 and length(coalesce(postcode, '')) <= 20
  and length(coalesce(note, '')) <= 4000 and length(coalesce(journey, '')) <= 20000
  and length(coalesce(next_action, '')) <= 300 and length(coalesce(lost_reason, '')) <= 500
  and octet_length(utm::text) <= 4096
);

-- history comments
alter table public.lead_events add constraint lead_events_comment_limit check (length(coalesce(comment, '')) <= 4000);

-- quotes: the frozen configuration and lines are JSON of a sane size
alter table public.quotes add constraint quotes_input_limits check (
  octet_length(config::text) <= 262144 and octet_length(lines::text) <= 262144 and octet_length(discount::text) <= 1024
  and total_net <= 5000000
);

-- access requests (open to the public)
alter table public.access_requests add constraint access_requests_input_limits check (
  length(coalesce(company, '')) <= 200 and length(coalesce(first_name, '')) <= 100 and length(coalesce(last_name, '')) <= 100
  and length(coalesce(location, '')) <= 200 and length(coalesce(note, '')) <= 2000
  and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
);

-- a negative line in a quote lowers the price without a discount ever being asked for: only the superadmin may enter one.
-- This also covers the requests of the public site (they arrive as quotes without an owner).
create or replace function public.quotes_lines_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(new.lines) = 'array'
     and (new.owner is null or not exists (select 1 from public.profiles p where p.id = new.owner and p.role = 'superadmin'))
     and exists (select 1 from jsonb_array_elements(new.lines) l where jsonb_typeof(l -> 'a') = 'number' and (l ->> 'a')::numeric < 0) then
    raise exception 'NEGATIVE_LINE: a quote line cannot have a negative amount' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.quotes_lines_guard() from public, anon, authenticated;
drop trigger if exists quotes_lines_guard on public.quotes;
create trigger quotes_lines_guard before insert on public.quotes
  for each row execute function public.quotes_lines_guard();
