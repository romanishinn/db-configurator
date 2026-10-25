-- 0002: bot protection for the public lead write.
-- The only database write a non-logged-in visitor can trigger is submit_request (a request
-- from the configurator becomes a lead + quote). Today anon may call it directly with the
-- publishable key, so a bot can create leads straight through the API, skipping any human check.
-- We close that: the browser roles lose the right to call submit_request, and only service_role
-- keeps it. The public site now reaches it through the "submit-request" Edge Function, which first
-- verifies a Cloudflare Turnstile token (proof of a human) and then calls the RPC as service_role.
-- Logged-in staff never used submit_request (they write quotes directly, behind auth + RLS), so
-- revoking it from authenticated changes nothing for them.

revoke execute on function public.submit_request(jsonb, jsonb, jsonb, text) from anon, authenticated;
grant  execute on function public.submit_request(jsonb, jsonb, jsonb, text) to service_role;
