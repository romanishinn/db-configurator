-- 0019: a callback request from the landing page WITHOUT a calculation (no quote is created).
-- Called only by the Edge Function (service_role) after the Turnstile check, like submit_request (0002).
-- The notification to the superadmins comes from the existing trigger leads_after_insert (0001); nothing is repeated here.
-- Consent to data processing is required: without p_consent = true the call fails with CONSENT_REQUIRED; the date of the
-- consent is leads.consent_at (null for older leads). No grant on consent_at for authenticated: only this function sets it.
-- ASSUMPTION: same limit as submit_request: at most 5 leads per day with the same phone or e-mail (any source).
alter table public.leads add column consent_at timestamptz;
create function public.submit_callback(p_contact jsonb, p_utm jsonb default '{}'::jsonb, p_journey text default null, p_consent boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := nullif(btrim(p_contact ->> 'phone'), ''); em text := nullif(lower(btrim(p_contact ->> 'email')), '');
begin
  if p_consent is not true then raise exception 'CONSENT_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce(ph, em) is null then raise exception 'CONTACT_REQUIRED' using errcode = 'P0001'; end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 day' and (phone = ph or lower(email) = em)) >= 5 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = 'P0001';
  end if;
  insert into public.leads (source, utm, journey, contact_name, phone, email, object_address, postcode, note, created_by, consent_at)
  values ('web', coalesce(p_utm, '{}'::jsonb), nullif(btrim(p_journey), ''), nullif(btrim(p_contact ->> 'name'), ''), ph, em,
          nullif(btrim(p_contact ->> 'address'), ''), nullif(btrim(p_contact ->> 'postcode'), ''), nullif(btrim(p_contact ->> 'note'), ''), auth.uid(), now());
end $$;
revoke all on function public.submit_callback(jsonb, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_callback(jsonb, jsonb, text, boolean) to service_role;
