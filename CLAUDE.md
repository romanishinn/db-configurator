# Instructions for Claude in this repo

- Product: D&B Solutions configurator (pergolas and side systems). Never write "Elwido" anywhere in this project.
- Never name the supplier/manufacturer anywhere (site, quotes, code, comments, data, commit messages, docs): refer to it as
  "the manufacturer" / «производитель». Supplier links live only in the private project notes.
- Hosting: GitHub only. Static site on GitHub Pages, CI and deploy via GitHub Actions. No Supabase, no Vercel, no other backend.
- Consequence: the pricing engine runs in the browser and the catalogue (suggested retail) price tables ship with the site.
  Never put purchase prices, dealer discounts or margins in this repository or in the built site.
- D&B Solutions has no CRM and no Odoo. Client/project/quote storage goes through a storage adapter;
  for now browser storage + JSON export/import. A persistent store is decided later (end customers will also use the app).
- Pricing data: `data/catalog/<version>/`. Never hand-edit table JSON; change the importer (`tools/import/`) and rebuild.
- Any number put into data by hand must be checked against the catalogue page image and listed in MANUAL/VERIFIED_SINGLE.
- Engine (`packages/core`) is pure TypeScript with no Node-only APIs in runtime code (loading from disk stays in test/import helpers).
  Add a golden test (value read from the catalogue page) for every new table or rule.
- Mark unconfirmed interpretations with `ASSUMPTION` comments.
- UI language for internal users: Russian; quote output: German and English first.
