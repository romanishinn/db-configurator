// create-invite — the superadmin issues an invite link for a dealer or architect.
// Deployed with verify_jwt = true: only a signed-in user reaches it; we additionally require that
// the caller is the superadmin. The invite carries the role and discount group; the invitee fills
// the rest and sets their own password on the join page (accept-invite).
//
// Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://romanishinn.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5500",
];
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

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500, h);

  // 1) who is calling — must be the superadmin (checked in the DB under their own identity)
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: me } = await asUser.auth.getUser();
  if (!me?.user) return json({ error: "unauthorized" }, 401, h);
  const { data: isAdmin, error: adminErr } = await asUser.rpc("is_superadmin");
  if (adminErr) return json({ error: "check_failed", message: adminErr.message }, 500, h);
  if (isAdmin !== true) return json({ error: "forbidden" }, 403, h);

  // 2) validate input
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, h); }
  const role = body.role;
  if (role !== "dealer" && role !== "architect") return json({ error: "bad_role" }, 400, h);
  const discountGroupId = typeof body.discount_group_id === "string" ? body.discount_group_id : null;

  // 3) create the invite as service_role (audited with the superadmin's id)
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await sb.from("invites")
    .insert({ role, discount_group_id: discountGroupId, created_by: me.user.id })
    .select("token, expires_at").single();
  if (error) return json({ error: "insert_failed", message: error.message }, 500, h);

  const origin = req.headers.get("origin") ?? ALLOWED_ORIGINS[0];
  return json({ ok: true, token: data.token, link: `${origin}/join.html?token=${data.token}`, expires_at: data.expires_at }, 200, h);
});
