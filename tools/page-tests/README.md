# Browser scenarios for the dealer and manager pages (stubbed Supabase)

`sh tools/page-tests/run.sh` opens `apps/projects/index.html` (manager) and `apps/submit/index.html` (dealer) in Chromium at 390 and
1100 px with a **stubbed** Supabase SDK and Storage (`manager-stub.txt`, `dealer-stub.txt`) and checks the page logic: roles, the order of
calls (re-encode → upload → update → remove → publish), the queue, consent, reject/unpublish, orders, error texts, "unavailable" without a backend.

What this does NOT prove: the real SDK, real RLS, real Storage, CORS of public URLs, real photo EXIF. Those need the stage project
(see docs/handoff). The stubs mirror the contract of `db/migrations/0010_project_submissions.sql`: change one, change the other.
`manager.js` and `manager-extra.js` print `PASS`/`FAIL` lines (89 checks). `dealer.js` only prints the observed values (lists, statuses, texts) and fails on a page error: it asserts less, read its output when the dealer page changes.
