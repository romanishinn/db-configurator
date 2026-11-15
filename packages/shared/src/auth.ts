// Roles and the current-user helpers, shared by all apps. Authorization itself is
// enforced in the database (RLS); these helpers only shape the UI.
export type Role = 'client' | 'manager' | 'dealer' | 'superdealer' | 'superadmin' | 'architect';

export const STAFF: Role[] = ['manager', 'dealer', 'superdealer', 'superadmin'];

export interface Me {
  id: string;
  role: Role;
  full_name?: string;
  email?: string;
  org_id?: string | null;
  discount_limit?: number | null;
}

export const isStaff = (me: Me | null): boolean => !!me && STAFF.includes(me.role);
export const isSuperadmin = (me: Me | null): boolean => !!me && me.role === 'superadmin';

/** load the signed-in user's profile (role, org, personal discount); null if not signed in */
export async function loadMe(sb: any): Promise<Me | null> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.from('profiles')
    .select('id, role, full_name, email, org_id, discount_limit')
    .eq('id', session.user.id).single();
  return (data as Me) || null;
}
