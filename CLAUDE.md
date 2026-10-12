# Instructions for Claude in this repo

- Product: D&B Solutions configurator for Sun Winner systems. Never write "Elwido" anywhere in this project.
- D&B Solutions has no CRM and no Odoo: client/project/quote tracking lives inside this app.
- Pricing data: `data/sunwinner/<version>/`. Never hand-edit table JSON; change the importer (`tools/import/`) and rebuild.
- Any number put into data by hand must be checked against the catalogue page image and listed in MANUAL/VERIFIED_SINGLE.
- Engine (`packages/core`) is pure TypeScript, server-side only. Add a golden test (value read from the catalogue page) for every new table or rule.
- Mark unconfirmed interpretations with `ASSUMPTION` comments.
- UI language for internal users: Russian; quote output: German and English first.
