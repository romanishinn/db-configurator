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
// One response shape for the page: { ok: true, number } or { ok: false, error: <code> }.
const fail = (error: string, status: number, h: Record<string, string>) => json({ ok: false, error }, status, h);

const JOURNEY_MAX_BYTES = 32 * 1024;
const MARK = "\n[... gekürzt / truncated]";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// cut to JOURNEY_MAX_BYTES of UTF-8 (mark included) without splitting a character; never throws
function limitJourney(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const enc = new TextEncoder();
  if (enc.encode(v).length <= JOURNEY_MAX_BYTES) return v;
  const room = JOURNEY_MAX_BYTES - enc.encode(MARK).length;
  const cut = new TextDecoder().decode(enc.encode(v).slice(0, room)).replace(/\uFFFD+$/, "");
  return cut + MARK;
}

Deno.serve(async (req) => {
  const h = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return fail("invalid_payload", 405, h);

  let body: Record<string, unknown>;
  try {
    const b = await req.json();
    if (!isObj(b)) return fail("invalid_payload", 400, h);
    body = b;
  } catch { return fail("invalid_payload", 400, h); }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return fail("turnstile_missing", 400, h);

  // payload shape and contact (checked before the Turnstile call: no point spending it on a bad form)
  const c = isObj(body.contact) ? body.contact : null;
  const q = isObj(body.quote) ? body.quote : null;
  if (!c || !q) return fail("invalid_payload", 400, h);
  if (typeof q.catalog !== "string" || !q.catalog.trim()) return fail("invalid_payload", 400, h);
  if (typeof q.total_net !== "number" || !Number.isFinite(q.total_net) || q.total_net < 0) return fail("invalid_payload", 400, h);
  const name = str(c.name, 200);
  const email = str(c.email, 254).toLowerCase();
  if (!name || !EMAIL.test(email)) return fail("contact_required", 400, h);
  const contact = {
    name, email, phone: str(c.phone, 50), address: str(c.address, 300), postcode: str(c.postcode, 20), note: str(c.note, 4000),
  };

  // 1) human check
  const secret = Deno.env.get("TURNSTILE_SECRET") ?? "";
  const ip = req.headers.get("CF-Connecting-IP") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  let outcome: { success?: boolean } = {};
  try {
    const vr = await fetch(SITEVERIFY, { method: "POST", body: form });
    outcome = await vr.json();
  } catch { return fail("server_error", 502, h); }  // Cloudflare unreachable: the page offers "retry"
  if (!outcome.success) return fail("turnstile_failed", 403, h);

  // 2) create the lead + quote, server-side, as service_role
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return fail("server_error", 500, h);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb.rpc("submit_request", {
    p_contact: contact,
    p_quote: q,
    p_utm: isObj(body.utm) ? body.utm : {},
    p_journey: limitJourney(body.journey),
  });
  if (error) {
    // the message is not logged or returned: it may echo personal data
    const m = error.message || "";
    if (/TOO_MANY_REQUESTS/.test(m)) return fail("too_many_requests", 429, h);
    if (/CONTACT_REQUIRED/.test(m)) return fail("contact_required", 400, h);
    return fail("server_error", 500, h);
  }
  return json({ ok: true, number: data }, 200, h);
});
