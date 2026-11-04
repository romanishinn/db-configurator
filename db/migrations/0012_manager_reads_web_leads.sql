-- A request from the public site has no creator and no assignee (submit_request runs as the server role), so under
-- lead_read only "see everything" roles could open it. A manager must see every NEW site request, with its quotes,
-- history (lead_events) and the client's journey. Read only: no write right is added.
-- quote_read, event_read, order_read and the lead_board view all go through lead_read, so they follow by themselves.
-- Once a site request is assigned (assign_lead / transfer_lead), it leaves this rule and follows the usual ones.
-- ASSUMPTION: "site request" = source 'web' with no creator and no assignee; dealer and manager leads never match.
-- ASSUMPTION: leads.journey is readable together with the lead (table-wide select grant of 0001); no separate grant needed,
-- anon has no grant on leads at all.
create policy lead_read_web on public.leads for select to authenticated using (
  public.my_role() = 'manager' and source = 'web' and created_by is null and assigned_to is null
);
