# Instructions for Claude in this repo

- Product: D&B Solutions configurator (pergolas and side systems). Never write "Elwido" anywhere in this project.
- Never name the supplier/manufacturer anywhere (site, quotes, code, comments, data, commit messages, docs): refer to it as
  "the manufacturer" / «производитель». Supplier links live only in the private project notes.
- Hosting: static site on GitHub Pages, CI and deploy via GitHub Actions. Login, roles and data (leads, quotes, history)
  live in PostgreSQL on Supabase (EU, Frankfurt) — decided 24.10.2026. No Vercel, no other backend.
- The pricing engine runs in the browser and the catalogue (suggested retail) price tables ship with the site.
  Never put purchase prices, the manufacturer's dealer discounts or margins in this repository, the built site or the database.
- Database: migrations only in `db/migrations/NNNN_*.sql` (never edit an applied one, add a new file), applied by the
  "Database" workflow with the `SUPABASE_DB_URL` secret. Secrets only in GitHub Secrets, never in code or chat.
  Who sees what is enforced by row level security and column grants in SQL, not by the page.
  Every new table, policy or rule gets a check in `db/test/access.sql` (`sh db/test/run.sh` runs it on a local Postgres).
- Keep the schema compact: plain relational tables, no column that can be derived from another (join or compute instead),
  JSON only for the configuration and frozen quote lines.
- Without `BACKEND.url` (prototype/backend.js) the site must keep working as before: no login, browser storage only.
- Pricing data: `data/catalog/<version>/`. Never hand-edit table JSON; change the importer (`tools/import/`) and rebuild.
- Any number put into data by hand must be checked against the catalogue page image and listed in MANUAL/VERIFIED_SINGLE.
- Engine (`packages/core`) is pure TypeScript with no Node-only APIs in runtime code (loading from disk stays in test/import helpers).
  Add a golden test (value read from the catalogue page) for every new table or rule.
- Mark unconfirmed interpretations with `ASSUMPTION` comments.
- UI language for internal users: Russian; quote output: German and English first.

## Harness (how every task is done)
- Every session starts from `docs/STATE.md` only (a hook prints it); do not read the whole archive. If it was not loaded, say so first and stop.
- Tasks go through `/task` and the agents in `.claude/agents/` (protocol: `docs/harness/README.md`). A subagent cannot ask the owner; the main session does.
- The owner's decisions are logged verbatim in `docs/decisions.md` (scribe). Never paraphrase them. Unconfirmed vision and promises are hypotheses.
- "Done" means working in production through every path (client UI, CRM, quote DE/EN, no-backend mode, access rules). Tests and a screenshot are only "implemented". State the level honestly.
- "It does not work" only after listing what was checked, what was learned and what is still a guess. Look for a ready solution before building one.
- Hand-off note at about 80% of the context, not later. Max two review rounds, then change the approach.
- Irreversible steps (production migration, deleting data, paid services, mail to real people, promises to customers) only on the owner's word. New things go: stage → own account → everyone.
- Run `sh tools/harness/redlines.sh` before saying "done".

