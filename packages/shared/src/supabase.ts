// Supabase connection config and a thin client factory, shared by the configurator
// bridge and the cabinet/CRM so there is one source of truth for the backend.
// The anon/publishable key is safe to ship — access is enforced by RLS, not by hiding it.
// Never put service-role keys, purchase prices or margins here.
export interface BackendConfig {
  url: string;
  anonKey: string;
  cabinet: string;
}

export const BACKEND: BackendConfig = {
  url: 'https://zypujyrvbegilvtvqras.supabase.co',
  anonKey: 'sb_publishable_1jTysmz6_Tz0zveMQN5GaQ_Pb8dHTL9',
  cabinet: 'cabinet.html',
};

/** create a client from the UMD supabase-js global loaded at runtime */
export function createClient(sdk: { createClient: (url: string, key: string) => unknown }): unknown {
  return sdk.createClient(BACKEND.url, BACKEND.anonKey);
}
