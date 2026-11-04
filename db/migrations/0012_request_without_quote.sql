-- 0012: (numbers 0010 and 0011 are reserved for the planned dealer-submission and seller-cleanup migrations; they apply
-- after this one if it goes live first, and none of them touches submit_request)
-- a callback request from the landing page has no configuration, so it has no quote.
-- Before: submit_request always inserted a quote, and a request without one failed (catalog is NOT NULL).
-- Now: the quote is inserted only when the request carries one (p_quote has a "catalog"); otherwise the
-- lead is created alone and the function returns null instead of a quote number.
-- Same signature, so the grants from 0002 (service_role only, via the Edge Function + Turnstile) stay as they are.
-- The lead keeps the same limits as before: a phone or an e-mail is required, 5 requests per contact per day.
create or replace function public.submit_request(p_contact jsonb, p_quote jsonb, p_utm jsonb default '{}'::jsonb, p_journey text default null) returns text
language plpgsql security definer set search_path = public as $$
declare l uuid; num text; ph text := nullif(btrim(p_contact ->> 'phone'), ''); em text := nullif(lower(btrim(p_contact ->> 'email')), '');
begin
  if coalesce(ph, em) is null then raise exception 'CONTACT_REQUIRED' using errcode = 'P0001'; end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 day' and (phone = ph or lower(email) = em)) >= 5 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = 'P0001';
  end if;
  insert into public.leads (source, utm, journey, contact_name, phone, email, object_address, postcode, note, created_by)
  values ('web', coalesce(p_utm, '{}'::jsonb), p_journey, p_contact ->> 'name', ph, em, p_contact ->> 'address', p_contact ->> 'postcode',
          p_contact ->> 'note', auth.uid())
  returning id into l;
  if p_quote ? 'catalog' then
    insert into public.quotes (lead_id, owner, catalog, config, lines, total_net)
    values (l, null, p_quote ->> 'catalog', p_quote -> 'config', coalesce(p_quote -> 'lines', '[]'::jsonb), (p_quote ->> 'total_net')::numeric)
    returning number into num;
  end if;
  return num;
end $$;
