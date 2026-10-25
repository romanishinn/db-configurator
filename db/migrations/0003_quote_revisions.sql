-- 0003: revisions of a quote keep the base number and add a version suffix.
-- Correcting КП 251026-1 saves a new quote numbered 251026-1.2, the next 251026-1.3, and so on.
-- Every revision stays its own row (visible in the lead), with a fresh 14-day validity; prices stay
-- frozen per row (a correction is a new quote, never an edit of the old price).

-- which quote this one corrects (any quote in the family); null = a brand-new quote
alter table public.quotes add column revises uuid references public.quotes (id) on delete set null;
grant insert (revises) on public.quotes to authenticated;

-- number assignment now knows about revisions
create or replace function public.quotes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_role; lim numeric; d jsonb; k text; base text; fam integer;
begin
  if tg_op = 'INSERT' then
    if new.revises is not null then
      select split_part(q.number, '.', 1) into base from public.quotes q where q.id = new.revises;
      if base is null then
        new.number := public.next_quote_no();                    -- parent vanished: fall back to a fresh number
      else
        select count(*) into fam from public.quotes
          where number = base or number like base || '.%';        -- the whole family: base + its revisions
        new.number := base || '.' || (fam + 1);                   -- 251026-1 -> 251026-1.2 -> 251026-1.3 …
      end if;
    else
      new.number := public.next_quote_no();                       -- never taken from the browser
    end if;
    new.created_at := now();
    new.valid_until := (now() at time zone 'Europe/Vienna')::date + 14;
  end if;
  if new.owner is null then return new; end if;                   -- public request (inserted by submit_request)
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
    if (d ->> k)::numeric < 0 or ((d ->> k)::numeric > lim and r <> 'superadmin') then
      raise exception 'DISCOUNT_LIMIT: % %% is above the personal limit of % %%', d ->> k, lim using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;
