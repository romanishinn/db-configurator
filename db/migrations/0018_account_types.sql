-- Account types the superadmin can add (the "+" in the settings). A type is a name plus the role it works as: the rights
-- come from that role, so "Installer" that works as "manager" sees and may do exactly what a manager does.
-- ASSUMPTION: no per-type rights yet (the owner postponed "dependencies"); a type can never work as the client role.
-- No role names in this file other than the values of the role enum.

create table public.account_types (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 40),
  base_role public.app_role not null check (base_role <> 'client'),
  created_at timestamptz not null default now()
);
create unique index account_types_title on public.account_types (lower(btrim(title)));
insert into public.account_types (title, base_role) values
  ('Суперадмин', 'superadmin'), ('СуперДилер', 'superdealer'), ('Менеджер', 'manager'), ('Дилер', 'dealer'), ('Архитектор', 'architect');

alter table public.account_types enable row level security;
create policy account_types_read on public.account_types for select to authenticated using (coalesce((select public.my_role()) <> 'client', false));
create policy account_types_admin on public.account_types for all to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
revoke all on public.account_types from anon, authenticated;
grant select on public.account_types to authenticated;
grant insert (title, base_role), update (title, base_role), delete on public.account_types to authenticated;   -- RLS limits writes to the superadmin

-- a type that people use keeps its role (changing it would change their rights behind their back)
create or replace function public.account_types_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.base_role is distinct from old.base_role and exists (select 1 from public.profiles where account_type_id = old.id) then
    raise exception 'TYPE_IN_USE: the role of a type that people use cannot change' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.account_types_guard() from public, anon, authenticated;

alter table public.profiles add column account_type_id uuid references public.account_types (id) on delete restrict;
create trigger account_types_guard before update on public.account_types for each row execute function public.account_types_guard();

-- the type follows the role: a role set by other means drops a type that no longer fits
create or replace function public.profiles_type_follows_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role and new.account_type_id is not distinct from old.account_type_id and new.account_type_id is not null
     and (select base_role from public.account_types where id = new.account_type_id) is distinct from new.role then
    new.account_type_id := null;
  end if;
  return new;
end $$;
revoke all on function public.profiles_type_follows_role() from public, anon, authenticated;
create trigger profiles_type_follows_role before update of role on public.profiles for each row execute function public.profiles_type_follows_role();

-- the superadmin sets the type of a person: the role follows the type
create or replace function public.set_user_type(p_user uuid, p_type uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.app_role;
begin
  if not public.is_superadmin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select base_role into r from public.account_types where id = p_type;
  if r is null then raise exception 'TYPE_UNKNOWN' using errcode = 'P0002'; end if;
  perform public.set_user_role(p_user, r);
  update public.profiles set account_type_id = p_type where id = p_user;
end $$;
revoke all on function public.set_user_type(uuid, uuid) from public, anon;
grant execute on function public.set_user_type(uuid, uuid) to authenticated;

-- invites: any type, not only dealer / architect; the invite names the type, the role follows it
alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check check (role <> 'client');
alter table public.invites add column account_type_id uuid references public.account_types (id) on delete restrict;
