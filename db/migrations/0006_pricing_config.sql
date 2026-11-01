-- Editable retail pricing config: service rates the superadmin can change without a redeploy.
-- Installation and delivery are a % of the configuration's goods subtotal, applied client-side.
-- Only retail (suggested) rates live here — never purchase prices, dealer discounts or margins.
create table if not exists public.pricing_config (
  id            smallint primary key default 1 check (id = 1),   -- single row
  install_pct   numeric(5,2) not null default 10 check (install_pct  >= 0 and install_pct  <= 100),
  delivery_pct  numeric(5,2) not null default 4  check (delivery_pct >= 0 and delivery_pct <= 100),
  updated_at    timestamptz  not null default now()
);

insert into public.pricing_config (id) values (1) on conflict (id) do nothing;

alter table public.pricing_config enable row level security;

-- the rates are shown on the public configurator, so everyone may read them
drop policy if exists pricing_config_read on public.pricing_config;
create policy pricing_config_read on public.pricing_config
  for select using (true);

-- only the superadmin may change them
drop policy if exists pricing_config_write on public.pricing_config;
create policy pricing_config_write on public.pricing_config
  for update using (public.is_superadmin()) with check (public.is_superadmin());

grant select on public.pricing_config to anon, authenticated;
grant update (install_pct, delivery_pct, updated_at) on public.pricing_config to authenticated;
