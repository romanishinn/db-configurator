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

## Projects sent by dealers (migration 0010)
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

## Switching it on (D&B)
1. supabase.com → New project, region **Frankfurt (eu-central-1)**, free plan.
2. GitHub → repository Settings → Secrets and variables → Actions → `SUPABASE_DB_URL` = Project Settings → Database →
   Connection string (URI, with the password). Then run the "Database" workflow (or push): the tables are created.
3. Project Settings → API: paste the Project URL and the `anon` public key into `BACKEND` in `prototype/backend.js`.
4. Authentication → Providers → Email: on; "Confirm email" on. Authentication → URL configuration: site URL
   `https://romanishinn.github.io/db-configurator/`.
5. First superadmin: create the user (Authentication → Users → Add user), then in the SQL editor:
   `update public.profiles set role = 'superadmin' where email = '…';` Further roles via `set_user_role`.

## Not yet (next phases)
Customer accounts in the customer view (save up to 3), dealer discount and branding in the quote, the superadmin board
as its own page, e-mail notifications (needs the D&B mail domain), server-side recomputation of a quote from its config
(engine in a Supabase Edge Function) for the price guarantee.
