-- Enum values that were added to the live database out-of-band; recorded here so the repo can rebuild
-- the schema. Idempotent (add value if not exists). Kept in their OWN migration because migrate.sh runs
-- each file in one transaction and a new enum value cannot be USED in the same transaction that adds it.
alter type public.app_role   add value if not exists 'architect';
alter type public.lead_stage add value if not exists 'processing';
alter type public.lead_stage add value if not exists 'proposal';
