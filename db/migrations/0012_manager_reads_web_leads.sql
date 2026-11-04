-- A request from the public site has no creator and no assignee (submit_request runs as the server role), so under
-- lead_read only "see everything" roles could open it. A manager must see every NEW site request, with its quotes,
-- history (lead_events) and the client's journey. READ ONLY: the write rules below are tied to "may edit", not "may see".
-- quote_read, event_read, order_read and the lead_board view all go through lead_read, so they follow by themselves.
-- Once a site request is assigned (assign_lead / transfer_lead) or moves past stage 'new', it leaves this rule.
-- ASSUMPTION: "site request" = source 'web' with no creator and no assignee; dealer and manager leads never match.
-- ASSUMPTION: leads.journey is readable together with the lead (table-wide select grant of 0001); anon has no grant on leads.
create policy lead_read_web on public.leads for select to authenticated using (
  public.my_role() = 'manager' and source = 'web' and created_by is null and assigned_to is null and stage = 'new'
);

-- "may edit this lead": the same condition as the lead_update policy (0001), as a function so that orders and quotes
-- can use it without depending on what the caller may merely see. security definer: it reads leads without RLS.
create function public.can_edit_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leads l where l.id = p_lead and (
      public.sees_all()
      or l.assigned_to = auth.uid()
      or (l.created_by = auth.uid() and public.my_role() in ('manager', 'dealer'))
      or (public.my_role() = 'dealer' and public.my_org() is not null and public.org_of(l.assigned_to) = public.my_org())
    )
  )
$$;
grant execute on function public.can_edit_lead(uuid) to authenticated;

-- orders: write by "may edit the lead" (was "lead visible" / no lead check on insert), so read access adds no write access
drop policy order_insert on public.orders;
create policy order_insert on public.orders for insert to authenticated with check (
  public.sees_all() or (public.my_role() in ('manager', 'dealer', 'superdealer') and public.can_edit_lead(lead_id))
);
drop policy order_update on public.orders;
create policy order_update on public.orders for update to authenticated using (
  public.sees_all() or (public.my_role() in ('manager', 'dealer', 'superdealer', 'architect') and public.can_edit_lead(lead_id))
);

-- quotes: a new quote may be attached only to a lead the user may edit (submit_request is security definer and unaffected)
drop policy quote_insert on public.quotes;
create policy quote_insert on public.quotes for insert to authenticated with check (
  owner = auth.uid() and (lead_id is null or public.can_edit_lead(lead_id))
);

-- quotes: re-linking an existing quote (UPDATE of lead_id) needs the same right; the 0001 policy had no WITH CHECK, so a
-- user could attach his own quote (with any total) to any lead whose id he can see
drop policy quote_link_lead on public.quotes;
create policy quote_link_lead on public.quotes for update to authenticated
  using (owner = auth.uid() or public.sees_all())
  with check (public.sees_all() or lead_id is null or public.can_edit_lead(lead_id));
