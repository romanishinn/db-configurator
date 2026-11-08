// Run: node supabase/functions/submit-request/callback.test.mjs (no Deno, no network)
import assert from "node:assert/strict";
import { validateCallback as v } from "./callback.mjs";
const ok = { consent: true, contact: { name: "Anna", email: "A@B.at" } };
assert.deepEqual(v({ ...ok, hp: "x" }), { honeypot: true });
assert.deepEqual(v({ ...ok, hp: "" }).contact.email, "a@b.at");
assert.equal(v({ ...ok, consent: "true" }).error, "consent_required");
assert.equal(v({ contact: ok.contact }).error, "consent_required");
assert.equal(v({ consent: true }).error, "invalid_payload");
assert.equal(v({ consent: true, contact: { name: " ", email: "a@b.at" } }).error, "contact_required");
assert.equal(v({ consent: true, contact: { name: "A" } }).error, "contact_required");
assert.equal(v({ consent: true, contact: { name: "A", email: "nope" } }).error, "contact_required");
assert.equal(v({ consent: true, contact: { name: "A", phone: "12345" } }).error, "contact_required");
assert.equal(v({ consent: true, contact: { name: "A", phone: "+43 1 234 56" } }).contact.phone, "+43 1 234 56");
assert.equal(v({ consent: true, contact: { name: "A", phone: "1".repeat(60) } }).contact.phone.length, 50);
const long = v({ consent: true, contact: { name: "n".repeat(300), email: "a@b.at", address: "a".repeat(400), postcode: "1".repeat(30), note: "x".repeat(5000) }, utm: [1] });
assert.deepEqual([long.contact.name.length, long.contact.address.length, long.contact.postcode.length, long.contact.note.length], [200, 300, 20, 4000]);
assert.deepEqual(long.utm, {});
console.log("callback.test: ok");
