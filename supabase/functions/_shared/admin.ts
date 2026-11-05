import { createClient } from 'npm:@supabase/supabase-js@2';

/** Service-role client: bypasses RLS. Only use inside edge functions. */
export const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export type ProfileSummary = { id: string; username: string; display_name: string | null };

export function displayName(p: ProfileSummary | null | undefined): string {
  if (!p) return 'Someone';
  return p.display_name?.trim() || `@${p.username}`;
}

export async function getProfile(id: string): Promise<ProfileSummary | null> {
  const { data } = await admin.from('profiles').select('id, username, display_name').eq('id', id).maybeSingle();
  return data;
}

export async function getEmail(userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error('getEmail', userId, error.message);
    return null;
  }
  return data.user?.email ?? null;
}
