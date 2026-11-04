# Backend: login, roles, leads, quotes (PostgreSQL on Supabase)

Design and decisions: Project doc `claude/roles-crm-design.md`. This file: what is built and how to switch it on.

## What is built (phase 1)
- `db/migrations/0001_roles_leads_quotes.sql`: tables `organizations`, `profiles`, `leads`, `quotes`, `lead_events`,
  `notifications`, `quote_counters`; view `lead_board` (7-day "no movement" flag); actions `assign_lead`, `transfer_lead`
  (comment required), `comment_lead`, `set_user_role`, `submit_request` (public site). Rules:
  - superadmin / superdealer see everything; seller sees what he entered and what was passed to him; dealer the same plus
    the leads of his company; client his own;
  - a lead entered by a seller or dealer is his from the start; assignment changes only through the actions;
  - refusal (`lost`) needs a reason; every stage change, assignment, transfer, comment and quote is in the history;
  - quote number `DDMMYY-N` from the server, price valid 14 days, prices frozen (a change is a new quote);
  - a client keeps at most 3 quotes; discount only on pergola / sides / text positions and within the personal limit;
  - superdealer may only make sellers; nobody raises his own role or limit;
  - in-app notifications: superadmins on every new request, the assignee on assignment / transfer.
- `db/test/access.sql`: 37 checks of the above, run by `sh db/test/run.sh` (local Postgres) and in the "Database" workflow.
- `db/migrate.sh` + workflow `.github/workflows/db.yml`: tests on every change, then applies new migrations to Supabase
  (only when the `SUPABASE_DB_URL` secret exists; tracked in `ops.migrations`).
- `prototype/backend.js` (inactive while `BACKEND.url` is empty): Pro opens only after login (e-mail + password, reset link);
  partner block at the top of the Pro panel: name, role, discount limit, unread count, "save quote" (new lead with the
  customer's name / phone / object address, or to the opened lead), tabs (superadmin/superdealer: all · unassigned ·
  7+ days; dealer/seller: mine · from D&B), lead card with stage, assignee, assign (superadmin/superdealer) or transfer to a
  dealer (seller), comments, history, open the last quote. The public request form also stores the lead and its quote.

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
- Migration `0008`: `leads.next_action` (what to do at `next_action_at`) and the view `customers` (one row per person, built from leads; same visibility as leads).
- Not built yet: approvals of discounts above the limit (needs a decision, see below), the `architect` role in the CRM (row level security does not yet let it create or read leads), drag and drop on boards.

## Not yet (next phases)
Customer accounts in the customer view (save up to 3), dealer discount and branding in the quote, the superadmin board
as its own page, e-mail notifications (needs the D&B mail domain), server-side recomputation of a quote from its config
(engine in a Supabase Edge Function) for the price guarantee.
