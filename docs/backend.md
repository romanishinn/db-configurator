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

## Projects sent by dealers (migration 0017)
- Table `project_private` (1:1 with `projects`; the public never reads it): order, sender (null = office), dealer note, rejection reason and note,
  consent (time, who confirmed, channel call/form/paper, text version, district may be shown). No status column: published = `projects.published`,
  rejected = `rejected_reason` is set, under review = sent by a dealer and neither. Date of the request = `projects.created_at`.
  One active project per order (partial unique index): after a rejection for quality (`light` etc.) the dealer may send again, after `consent_withdrawn` not.
- Rules in SQL: publishing ANY project needs a recorded consent (trigger, `CONSENT_REQUIRED`; also for projects added by the office, also a rejected one stays unpublishable);
  without the district consent the trigger clears `projects.district` on publishing (it is publicly readable; `''`), and neither the district nor the order's postcode
  may occur in the title (`DISTRICT_NOT_ALLOWED`; lower case, blanks/hyphens equal, whole words only, candidates of 2+ characters: `Au` does not block `Ausblick`, `Wien 13` catches `Villa in Wien-13.`).
  Synonyms are not caught: the manager answers for the caption. Only the title is required when published
  (a dealer's request starts with the title `Bioklimatische Pergola, <year>` and the postcode in `district`, which is cleared on publishing without consent).
- `list_my_installed_orders()` (dealer only): his orders (same visibility rule as `submit_project`, helper `dealer_can_see_order`) in stage `done` confirmed by the office and without an active project.
- `project_private` is write-protected for everybody (`authenticated` has only SELECT, no insert/update policies): only the functions below write it (security definer).
  The dealer reads his own rows, staff read all.
- Functions (all `security definer`, error code first in the message, `anon` has no execute on any of them): `submit_project` (dealer only; assurance; own order by the lead_read rule;
  order `done` AND `order_installed_by_office`; the unique index decides "one active project per order", a unique violation becomes `ALREADY_SUBMITTED`; blank note = null),
  `attach_photos` (author, once: `PROJECT_HAS_PHOTOS` when the list is not empty, `TOO_FEW_PHOTOS` for an empty list, max 12, paths `<project id>/<uuid>.jpg`; the row is locked),
  `reject_project`, `unpublish_project` (sets `consent_withdrawn`; `ALREADY_SUBMITTED` if the order was sent again), `record_consent`,
  `order_installed_by_office` (helper, not callable by users: the last `done` event of the order was written by a manager or superadmin; ASSUMPTION: a superdealer does not count,
  owner: "монтаж подтверждает менеджер"), `complete_installation` (manager/superadmin: sets `done`, or, when a dealer set `done` himself, adds a confirming `lead_events` row
  with comment `installation confirmed by the office`; idempotent), `list_orders_for_installation` (manager/superadmin: id, stage, contact name, postcode and
  `needs_confirmation` of the orders that are not `done` or whose `done` is not confirmed by the office; the manager still sees no other lead data; ASSUMPTION: `needs_confirmation`
  is true when the stage is already `done`). Notifications: `notify_managers` (managers and superadmins) on a request; the dealer on rejection or withdrawal.
- Who can do what: the dealer sees only his own requests (`projects` and `project_private`), writes nothing directly, uploads only `<own open project id>/<uuid>.jpg`
  and cannot read, change or delete files. A manager deletes files only of unpublished projects (files of published ones: superadmin only); update of files: superadmin only.
- Known limit: an employee can technically publish a dealer's request past the queue and the photo re-encoding by a direct update over REST (the queue is kept by the page; staff are trusted).
- Known limit: a dealer can insert an order straight in `done` and even on a foreign lead (old `order_insert` from 0005); the office's installation confirmation covers this for requests, but order data is not trusted.
- Known limit: `record_consent` on a published project fails with `DISTRICT_NOT_ALLOWED` if the consent is narrowed while the district is still in the title: edit the title first.
- Known limits: the test stub does not check real Storage (path helper `storage.foldername` is copied, upload/mime/size limits are not exercised);
  `attach_photos` does not check that the files exist; photos of a project must live in the folder named by the project id for the manager's delete rule to apply;
  EXIF/GPS is not stripped in SQL (the browser must do it); consent fields change only through `record_consent` (the manager has no direct write);
  country is set to AT on a request (the office corrects it); not run on the production database yet.

## Clean-up after the manager rename (migration 0018)
- `leads_before_insert` no longer turns source `seller` into `manager`; the old value is refused by `leads_source_check`. Browser tabs opened before 0009 must be reloaded.
- `transfer_lead` is recreated (definition of 0014) without the old role label; `assign_lead` (0009) already had none.
- Discount group `agent` is renamed from "Агенты / продавцы" to "Агенты" (idempotent update).
- The migration ends with the 0009 safety net: no function, policy, check, view, default or trigger mentions the old label (`orders.seller_id` is a different word and stays).

## Callback request without a calculation (migration 0019)
- `submit_callback(p_contact jsonb, p_utm jsonb, p_journey text, p_consent boolean) returns void`: requires `p_consent = true` (else `CONSENT_REQUIRED`) and stores the date in `leads.consent_at` (null for older leads; not writable by authenticated). For the Edge Function only (`service_role`; anon and authenticated are revoked explicitly). Creates a lead with source `web`, no quote.
- Needs a phone or an e-mail (`CONTACT_REQUIRED`); at most 5 leads per day with the same phone or e-mail, any source (`TOO_MANY_REQUESTS`); empty strings become null; the input limits of 0015 apply.
- The superadmin notification comes from the existing trigger on `leads`; a manager sees the new unassigned web lead by the rule of 0012.
- Known limits: the limit counts all leads of that contact, not only callbacks; the rate limit is per contact, not per IP (Turnstile in the Edge Function is the bot protection); not yet run against a real Supabase.

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
- Migration `0013` (paging): the CRM never loads "all leads". `lead_page(chip, q, limit, offset)` returns one page (Today filters `need / late / wait / open / all`, board columns `c0..c4`, search by name, e-mail, address, note, quote number or the digits of a phone in any format; wildcards typed by the user are literal); `lead_counts()` gives the numbers of the chips and columns; `crm_stats()` gives the overview (totals, per employee, per source). All three run with the caller's rights (`security invoker`), so row level security decides what is counted. The Today list loads 40 rows and the next page when the end scrolls into view; each board column loads 20 cards and a "Show more" button; customers and quotes are paged and searched on the server. A search looks through every lead, closed ones too. A light question every minute (`lead_counts` + the newest activity) decides whether the pages are read again.
- Migration `0014` (access hardening, from the security review): a deactivated login loses all CRM access (restrictive policies on leads, quotes, orders, events, notifications, approvals); a dealer cannot change `kind`, currency, country or discount group of his company; `org_of()` answers only for the caller's own company; clients do not read discount groups; the tables created after 0001 had every right for the API roles by Supabase's default privileges: they are closed and only the intended rights are given back, default privileges are closed for new objects (the test stub reproduces Supabase's defaults, so CI sees this).
- Migration `0015` (limits): length and size limits on leads, comments, quotes and the public access request (e-mail format); a negative quote line is refused for everyone but the superadmin, requests of the public site included. The price itself is still computed in the browser and trusted by the server: a server-side recalculation (Edge Function on `packages/core`) is the open item of the security review.
- Migration `0016` (speed): the policies called their helper functions once per row; wrapped in `(select ...)` they run once per statement; the dealer's company check is one array; indexes in the order the lists are read; `norm_phone` is inlined. Load test (local Postgres 16, 4 vCPU, 300 people, 100 000 leads, 250 000 quotes, 1.5 M events), medians: the board of 2000 rows 4-9 s → 30-130 ms, customers 4-8 s → 20-450 ms, notifications 1.3 s → 0.2 ms, the quote list 13-17 s → 5-600 ms, the overview 14 s → 0.5 s. **Not done yet:** `lead_page` for the superadmin (335 ms, search 1.7 s; a rewrite with a plan per filter and a server-side search index brings it to 2-16 ms, it needs its own review because it changes the search of quote numbers), paging of the quote list by RPC. **Size:** at these volumes the database is about 800 MB; the free Supabase plan holds 500 MB (roughly 40% of the assumed volume): plan the paid plan or an archive of old lost leads before real volume arrives. Writes are fine (50 parallel quote inserts queue on the day counter, no errors, ~430/s).
- Edge Function `accept-invite`: the invite is taken in one statement (`used_at is null`), so parallel requests cannot create several accounts with one token; an invite made for an e-mail is for that address only; the company of the invite is applied. (Deployed only when the owner merges.)
- Data on the device: the first Today page (without the customer's journey text), the counters and the user's role are kept in `localStorage` (`crm.cache.v1`) so the next start draws at once and the server confirms in the background. One user, at most 7 days, removed on sign-out and when the session ends. It is personal data of customers: mention it in the privacy text; a locked screen on a shared tablet is the real protection.
- Login backdrop: eight CSS bars, no 3D library; the page is 280 KB (79 KB gzip) instead of 886 KB (229 KB).
- Boards: drag a card to another column (mouse, or press and hold on a touch screen); a slim icon rail on tablets; a bottom tab bar on phones.
- Languages: the switcher (🌐 in the top bar, also in Settings and on the login screen) is available to every user; the choice is remembered per browser. One list `LANGS` in `crm.html` drives all three menus. The whole CRM follows the language: the old screens through the `T` table in `crm.html`, the live screens through `prototype/crm-i18n.js` (keyed by the Russian source text; fallback: chosen language → English → Russian). Offered now: RU, EN, DE, HR, ES. The configurator and the customer's quote have their own texts for RU, EN, DE, HR only: with another interface language (ES) the CRM opens the configurator in English. **Adding a language:** add `[code, native name]` to `LANGS`, add its texts to `T` and to every entry of `crm-i18n.js`, and check that the configurator (it has its own texts) supports the code. Dates and numbers follow the language. Notifications and history lines written by the database start with a fixed Russian phrase that the CRM translates; the customer's own words (notes, names) are shown as typed.
- Role names: the sales role is `manager` (created as `seller` by 0001, renamed by `0009_manager_role`). The CRM still accepts `seller` for older databases. Only the superadmin sets roles.

## Not yet (next phases)
Customer accounts in the customer view (save up to 3), dealer discount and branding in the quote, the superadmin board
as its own page, e-mail notifications (needs the D&B mail domain), server-side recomputation of a quote from its config
(engine in a Supabase Edge Function) for the price guarantee.
