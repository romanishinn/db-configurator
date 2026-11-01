-- Capture the 'architect' role in the repo. It was added to the live database earlier via an
-- out-of-band migration; this records it as the source of truth. Idempotent: a no-op where it
-- already exists. Must be its own migration (a new enum value cannot be used in the same
-- transaction that adds it), so later migrations may reference 'architect'.
alter type public.app_role add value if not exists 'architect';
