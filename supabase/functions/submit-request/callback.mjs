// Pure validation of the "callback request" body (kind: 'callback'), shared by the Edge Function (Deno) and the Node unit test.
// No Deno or Node APIs here. Field limits match the quote branch of index.ts.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * @param {Record<string, unknown>} body
 * @returns {{ honeypot: true } | { error: string } | { contact: Record<string, string>, utm: Record<string, unknown> }}
 */
export function validateCallback(body) {
  if (typeof body.hp === "string" ? body.hp.trim() !== "" : body.hp != null && body.hp !== false) return { honeypot: true };
  if (body.consent !== true) return { error: "consent_required" };
  const c = isObj(body.contact) ? body.contact : null;
  if (!c) return { error: "invalid_payload" };
  const name = str(c.name, 200);
  if (!name) return { error: "contact_required" };
  const email = str(c.email, 254).toLowerCase();
  const phone = str(c.phone, 50);
  const okEmail = EMAIL.test(email);
  const okPhone = (phone.match(/\d/g) || []).length >= 6;
  if (!okEmail && !okPhone) return { error: "contact_required" };
  return {
    contact: {
      name, email: okEmail ? email : "", phone: okPhone ? phone : "",
      address: str(c.address, 300), postcode: str(c.postcode, 20), note: str(c.note, 4000),
    },
    utm: isObj(body.utm) ? body.utm : {},
  };
}
