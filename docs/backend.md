# Backend: login, roles, leads, quotes (PostgreSQL on Supabase)

Design and decisions: Project doc `claude/roles-crm-design.md`. This file: what is built and how to switch it on.

## What is built (phase 1)
- `db/migrations/0001_roles_leads_quotes.sql`: tables `organizations`, `profiles`, `leads`, `quotes`, `lead_events`,
  `notifications`, `quote_counters`; view `lead_board` (7-day "no movement" flag); actions `assign_lead`, `transfer_lead`
  (comment required), `comment_lead`, `set_user_role`, `submit_request` (public site). Rules:
  - superadmin / superdealer see everything; manager (renamed from seller by migration 0009) sees what he entered and what was passed to him; dealer the same plus
    the leads of his company; client his own;
  - a lead entered by a manager or dealer is his from the start; assignment changes only through the actions;
  - refusal (`lost`) needs a reason; every stage change, assignment, transfer, comment and quote is in the history;
  - quote number `DDMMYY-N` from the server, price valid 14 days, prices frozen (a change is a new quote);
  - a client keeps at most 3 quotes; discount only on pergola / sides / text positions and within the personal limit;
  - only the superadmin sets the manager role (managers register themselves); nobody raises his own role or limit;
  - in-app notifications: superadmins on every new request, the assignee on assignment / transfer.
- `db/test/access.sql`: checks of the above, run by `sh db/test/run.sh` (local Postgres) and in the "Database" workflow.
- Storage `project-photos`: a manager has only INSERT and SELECT (no UPDATE/DELETE: rename and upsert would bypass the delete
  ban); UPDATE/DELETE are the superadmin's. A photo a manager removes from a project stays as a file in the public bucket
  and opens by its old link; the superadmin cleans up. Known limitation until the decision on dealers submitting projects.
- `db/migrate.sh` + workflow `.github/workflows/db.yml`: tests on every change, then applies new migrations to Supabase
  (only when the `SUPABASE_DB_URL` secret exists; tracked in `ops.migrations`).
- `prototype/backend.js` (inactive while `BACKEND.url` is empty): Pro opens only after login (e-mail + password, reset link);
  partner block at the top of the Pro panel: name, role, discount limit, unread count, "save quote" (new lead with the
  customer's name / phone / object address, or to the opened lead), tabs (superadmin/superdealer: all · unassigned ·
  7+ days; dealer/manager: mine · from D&B), lead card with stage, assignee, assign (superadmin/superdealer) or transfer to a
  dealer (manager), comments, history, open the last quote. The public request form also stores the lead and its quote.

## Reference projects on the landing page (migration 0008)
- Table `projects` (public data only: title, district, country, options, installation date, photo paths, video link, flags
  `reference_available` / `published`, order) and the public bucket `project-photos`. The public sees published projects only;
  the superadmin and managers add and edit (rows and photos; a manager also sees drafts), only the superadmin deletes (migration 0009). A published project needs at least one photo. The owner's contact is never stored:
  the flag only says the owner agreed to a reference call, the office passes the contact on by phone.
- `apps/projects/index.html` → `projects.html`: the form for the superadmin and managers (phone friendly): fields, photo upload (resized in the browser to 1800 px),
  cover = first photo, publish switch. Adding a project needs no deploy.
- `apps/landing/index.html` → `landing.html`: German B2C landing. Reads the published projects over the REST API with the public key;
  when the database is off, unreachable or has no published project, the static placeholder cards stay. `noindex` until the placeholders
  (photos, address, phone) are replaced with real data. The request form there is still a preview (not yet wired to `submit_request`).

## Switching it on (D&B)
1. supabase.com → New project, region **Frankfurt (eu-central-1)**, free plan.
2. GitHub → repository Settings → Secrets and variables → Actions → `SUPABASE_DB_URL` = Project Settings → Database →
   Connection string (URI, with the password). Then run the "Database" workflow (or push): the tables are created.
3. Project Settings → API: paste the Project URL and the `anon` public key into `BACKEND` in `prototype/backend.js`.
4. Authentication → Providers → Email: on; "Confirm email" on. Authentication → URL configuration: site URL
   `https://romanishinn.github.io/db-configurator/`.
5. First superadmin: create the user (Authentication → Users → Add user), then in the SQL editor:
   `update public.profiles set role = 'superadmin' where email = '…';` Further roles via `set_user_role`.

## Pro CRM on live data (`prototype/crm.html` + `prototype/crm-live.js`)
`crm.html` is the layout; `crm-live.js` (inlined by the Pages workflow) turns it into a working CRM when the Supabase URL is set:
- Real login (e-mail + password, roles seller / dealer / superdealer / superadmin; other roles are signed out). Without a backend the page shows its demo data as before.
- Today (filters: needs you / overdue / waiting / all, search by name, phone, e-mail, quote no., ⌘K), lead and order boards, quotes list, customers, overview, settings (users, invites, access requests, discount groups, service rates), notifications bell.
- Lead card: source badge (Meta / Google / site …), the customer's message, the configurator journey, UTM details, contact buttons (call, WhatsApp, e-mail, map), next step with date, stage move, refusal with a reason, transfer / "take", notes, history, quotes of the lead and hand-off to the configurator (`db.handoff`, `?model`).
- New lead form (phone or name is enough) with a duplicate warning that matches phone formats (last 9 digits).
- Migration `0010`: `leads.next_action` (what to do at `next_action_at`) and the view `customers` (one row per person, built from leads; same visibility as leads).
- Migration `0011`:
  - **Approvals.** A discount above the personal limit no longer fails for staff: the quote is saved and queued in `quote_approvals` (`pending`); only the superadmin decides (`decide_approval`, a rejection needs a comment); the owner is notified. A client still cannot give a discount. ASSUMPTION: the database cannot stop someone from showing an unapproved price to a customer, the CRM shows the status on the quote and in the queue. The configurator does not send `quotes.discount` yet, so the queue fills only once it does.
  - **Architect** works with his own projects and quotes only (he sees what he entered himself and his own quotes; no orders, no other people's leads).
  - `lead_board` is rebuilt so it carries `score` and `next_action` (a view freezes the columns it had when it was created).
  - Trigger functions are no longer callable through the public API.
- Boards: drag a card to another column (mouse, or press and hold on a touch screen); a slim icon rail on tablets; a bottom tab bar on phones.
- Languages: the switcher (🌐 in the top bar, also in Settings and on the login screen) is available to every user; the choice is remembered per browser. One list `LANGS` in `crm.html` drives all three menus. The whole CRM follows the language: the old screens through the `T` table in `crm.html`, the live screens through `prototype/crm-i18n.js` (keyed by the Russian source text; fallback: chosen language → English → Russian). Offered now: RU, EN, DE, HR. **Adding a language:** add `[code, native name]` to `LANGS`, add its texts to `T` and to every entry of `crm-i18n.js`, and check that the configurator (it has its own texts) supports the code. Dates and numbers follow the language. Notifications and history lines written by the database start with a fixed Russian phrase that the CRM translates; the customer's own words (notes, names) are shown as typed.
- Role names: the sales role is `manager` (created as `seller` by 0001, renamed by `0009_manager_role`). The CRM still accepts `seller` for older databases. Only the superadmin sets roles.

## Not yet (next phases)
Customer accounts in the customer view (save up to 3), dealer discount and branding in the quote, the superadmin board
as its own page, e-mail notifications (needs the D&B mail domain), server-side recomputation of a quote from its config
(engine in a Supabase Edge Function) for the price guarantee.
