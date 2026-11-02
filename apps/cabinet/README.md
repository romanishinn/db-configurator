# apps/cabinet — dealer/superadmin CRM

Staff area, opened after login (see `crm-architecture.md`, `code-architecture.md`).
Deployed as `/cabinet.html` on the same subdomain as the configurator, sharing one
Supabase session via `@db/shared`.

Status (step 5, in progress):
- `cabinet.html` relocated here from `prototype/` (deploy path updated in `pages.yml`).
- Next: port the polished CRM UI from the prototype artifact into modular
  `screens/` (today, leads, orders, admin, settings, pricing), each reusing
  `@db/shared` (supabase, auth, i18n, ui) instead of duplicating it.
- Pricing editor: edit `pricing_config` (migration 0004) — installation/delivery
  rates — from Settings; superadmin-only by RLS.
