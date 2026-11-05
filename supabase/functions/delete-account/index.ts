// Permanently delete the calling user's account (App Store requirement).
// Called with the user's own JWT; partners are told before the data is removed.
import { admin, displayName, getProfile } from '../_shared/admin.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { alertPartners } from '../_shared/partners.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in' }, 401);

  const { data, error } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (error || !user) return json({ error: 'Not signed in' }, 401);

  try {
    const name = displayName(await getProfile(user.id));
    await alertPartners(
      user.id,
      `${name} deleted their account`,
      `${name} deleted their Leash account, so you're no longer their accountability partner.`,
      { kind: 'account_deleted' },
    );
  } catch (e) {
    // Never block a deletion because a notification failed.
    console.error('delete-account: partner alert failed', e);
  }

  // Cascades through profiles -> limits, requests, votes, partnerships, tokens, events.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error('delete-account failed', delErr.message);
    return json({ error: 'Could not delete the account. Please try again.' }, 500);
  }
  return json({ ok: true });
});
