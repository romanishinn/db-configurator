-- 0019: a callback request from the landing page WITHOUT a calculation (no quote is created).
-- Called only by the Edge Function (service_role) after the Turnstile check, like submit_request (0002).
-- The notification to the superadmins comes from the existing trigger leads_after_insert (0001); nothing is repeated here.
-- ASSUMPTION: same limit as submit_request: at most 5 leads per day with the same phone or e-mail (any source).
create function public.submit_callback(p_contact jsonb, p_utm jsonb default '{}'::jsonb, p_journey text default null) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := nullif(btrim(p_contact ->> 'phone'), ''); em text := nullif(lower(btrim(p_contact ->> 'email')), '');
begin
  if coalesce(ph, em) is null then raise exception 'CONTACT_REQUIRED' using errcode = 'P0001'; end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 day' and (phone = ph or lower(email) = em)) >= 5 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = 'P0001';
  end if;
  insert into public.leads (source, utm, journey, contact_name, phone, email, object_address, postcode, note, created_by)
  values ('web', coalesce(p_utm, '{}'::jsonb), nullif(btrim(p_journey), ''), nullif(btrim(p_contact ->> 'name'), ''), ph, em,
          nullif(btrim(p_contact ->> 'address'), ''), nullif(btrim(p_contact ->> 'postcode'), ''), nullif(btrim(p_contact ->> 'note'), ''), auth.uid());
end $$;
revoke all on function public.submit_callback(jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_callback(jsonb, jsonb, text) to service_role;
