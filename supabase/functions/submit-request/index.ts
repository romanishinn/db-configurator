// submit-request — the only way the public site may create a lead.
// 1) verify the visitor is human with Cloudflare Turnstile (secret in TURNSTILE_SECRET),
// 2) then create the lead + quote by calling submit_request as service_role.
// Deployed with verify_jwt = false: anonymous visitors have no JWT; Turnstile is the gate.
//
// Env: TURNSTILE_SECRET (set via Supabase secrets); SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are injected by the platform. For local/test, Cloudflare's test secret "1x0000000000000000000000000000000AA" always passes.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://romanishinn.github.io",
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5500",
];
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "content-type": "application/json" } });

Deno.serve(async (req) => {
  const h = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, h);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, h); }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return json({ error: "turnstile_missing" }, 400, h);

  // 1) human check
  const secret = Deno.env.get("TURNSTILE_SECRET") ?? "";
  const ip = req.headers.get("CF-Connecting-IP") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  let outcome: { success?: boolean; "error-codes"?: string[] } = {};
  try {
    const vr = await fetch(SITEVERIFY, { method: "POST", body: form });
    outcome = await vr.json();
  } catch { return json({ error: "turnstile_unreachable" }, 502, h); }
  if (!outcome.success) return json({ error: "turnstile_failed", codes: outcome["error-codes"] ?? [] }, 403, h);

  // 2) create the lead + quote, server-side, as service_role
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_misconfigured" }, 500, h);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb.rpc("submit_request", {
    p_contact: body.contact ?? {},
    p_quote: body.quote ?? {},
    p_utm: body.utm ?? {},
    p_journey: typeof body.journey === "string" ? body.journey : null,
  });
  if (error) {
    const m = error.message || "";
    const status = /CONTACT_REQUIRED|TOO_MANY_REQUESTS/.test(m) ? 400 : 500;
    return json({ error: "rpc_failed", message: m }, status, h);
  }
  return json({ ok: true, number: data }, 200, h);
});
