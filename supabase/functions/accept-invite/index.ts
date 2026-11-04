// accept-invite — a prospect opens the invite link, fills their details and sets their OWN password;
// this creates their account with the role (and discount group) the superadmin chose.
// Deployed with verify_jwt = false: there is no login yet; the invite token is the gate.
//
// Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { passwordProblem } from "../_shared/password.ts";

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

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async (req) => {
  const h = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, h);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, h); }

  const token = str(body.token);
  const email = str(body.email).toLowerCase();
  const firstName = str(body.first_name);
  const lastName = str(body.last_name);
  const location = str(body.location);
  const password = typeof body.password === "string" ? body.password : "";

  if (!token) return json({ error: "token_missing" }, 400, h);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "bad_email" }, 400, h);
  if (!firstName || !lastName || !location) return json({ error: "fields_required" }, 400, h);
  const pwProblem = passwordProblem(password);
  if (pwProblem) return json({ error: "weak_password", problem: pwProblem }, 400, h);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500, h);
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1) take the invite in ONE statement: of several parallel requests with the same token only one gets it
  const nowIso = new Date().toISOString();
  const { data: inv } = await sb.from("invites")
    .update({ used_at: nowIso })
    .eq("token", token).is("used_at", null).gt("expires_at", nowIso)
    .select("id, role, account_type_id, discount_group_id, org_id, email").maybeSingle();
  if (!inv) {
    // say why: unknown, already used or expired
    const { data: old } = await sb.from("invites").select("used_at, expires_at").eq("token", token).maybeSingle();
    if (!old) return json({ error: "invite_invalid" }, 400, h);
    if (old.used_at) return json({ error: "invite_used" }, 400, h);
    return json({ error: "invite_expired" }, 400, h);
  }
  const release = async () => { await sb.from("invites").update({ used_at: null, used_by: null }).eq("id", inv.id); };
  // an invite made for one e-mail address is for that address only
  if (inv.email && inv.email.toLowerCase() !== email) { await release(); return json({ error: "invite_email_mismatch" }, 403, h); }

  // the discount cap for the chosen group (becomes the person's personal limit)
  let discountLimit = 0;
  if (inv.discount_group_id) {
    const { data: g } = await sb.from("discount_groups").select("max_discount").eq("id", inv.discount_group_id).single();
    if (g) discountLimit = Number(g.max_discount) || 0;
  }

  // 2) create the auth user with their own password (email already confirmed — superadmin invited them)
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: `${firstName} ${lastName}`, location },
  });
  if (cErr || !created?.user) {
    await release();   // nothing was created: the invite stays usable
    const msg = cErr?.message || "create_failed";
    const status = /already been registered|already exists/i.test(msg) ? 409 : 500;
    return json({ error: "create_failed", message: msg }, status, h);
  }
  const uid = created.user.id;

  // 3) the auth_user_created trigger made a client profile — promote it to the invited role (and company, if the invite names one)
  const { error: pErr } = await sb.from("profiles")
    .update({ role: inv.role, discount_limit: discountLimit, full_name: `${firstName} ${lastName}`, active: true, ...(inv.account_type_id ? { account_type_id: inv.account_type_id } : {}), ...(inv.org_id ? { org_id: inv.org_id } : {}) })
    .eq("id", uid);
  if (pErr) return json({ error: "profile_failed", message: pErr.message }, 500, h);

  // 4) the invite is already burnt (step 1); record who used it
  await sb.from("invites").update({ used_by: uid, email }).eq("id", inv.id);

  return json({ ok: true, email, role: inv.role }, 200, h);
});
