// One-tap approve/deny for partners who use email links instead of the app.
//   POST { token }                      -> preview the request
//   POST { token, decision, comment? }  -> cast the vote (single use)
import { admin, displayName, getProfile } from '../_shared/admin.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/tokens.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { token?: string; decision?: string; comment?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!body.token || typeof body.token !== 'string' || body.token.length > 100) {
    return json({ error: 'Missing token' }, 400);
  }
  if (body.decision !== undefined && body.decision !== 'approve' && body.decision !== 'deny') {
    return json({ error: 'Invalid decision' }, 400);
  }
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 280) || null : null;

  const { data: tok } = await admin
    .from('vote_tokens')
    .select('*')
    .eq('token_hash', await sha256Hex(body.token))
    .maybeSingle();
  if (!tok) return json({ error: 'This link is invalid.' }, 404);

  const { data: request } = await admin
    .from('extension_requests')
    .select('id, requester_id, minutes_requested, reason, status, expires_at, created_at, limit:limits(name)')
    .eq('id', tok.request_id)
    .maybeSingle();
  if (!request) return json({ error: 'This request no longer exists.' }, 404);

  const requester = await getProfile(request.requester_id);
  const voter = await getProfile(tok.voter_id);
  const limitName = (request.limit as { name?: string } | null)?.name ?? null;
  const preview = {
    requesterName: displayName(requester),
    voterName: displayName(voter),
    minutes: request.minutes_requested,
    reason: request.reason,
    limitName,
    status: request.status,
    expiresAt: request.expires_at,
    createdAt: request.created_at,
    alreadyUsed: tok.used_at !== null,
  };

  if (!body.decision) return json({ request: preview });

  if (tok.used_at) return json({ error: 'You already responded using this link.', request: preview }, 409);
  if (new Date(tok.expires_at) < new Date()) return json({ error: 'This link has expired.', request: preview }, 410);
  if (request.status !== 'pending' || new Date(request.expires_at) < new Date()) {
    return json({ error: 'This request has already been decided.', request: preview }, 409);
  }

  // Partnership may have been removed since the email was sent.
  const { data: partnership } = await admin
    .from('partnerships')
    .select('id')
    .eq('owner_id', request.requester_id)
    .eq('partner_id', tok.voter_id)
    .eq('status', 'accepted')
    .maybeSingle();
  if (!partnership) return json({ error: 'You are no longer this person’s partner.' }, 403);

  // Claim the token first so a double-click can't vote twice.
  const { data: claimed } = await admin
    .from('vote_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tok.token_hash)
    .is('used_at', null)
    .select('token_hash')
    .maybeSingle();
  if (!claimed) return json({ error: 'You already responded using this link.', request: preview }, 409);

  const { error: voteErr } = await admin.from('request_votes').insert({
    request_id: request.id,
    voter_id: tok.voter_id,
    decision: body.decision,
    comment,
  });
  if (voteErr) {
    if (voteErr.code === '23505') return json({ error: 'You already voted on this request.' }, 409);
    console.error('vote insert failed', voteErr);
    return json({ error: 'Could not record your vote.' }, 500);
  }

  // The resolve_request trigger may have changed the status.
  const { data: updated } = await admin
    .from('extension_requests')
    .select('status')
    .eq('id', request.id)
    .single();

  return json({ ok: true, request: { ...preview, status: updated?.status ?? request.status, alreadyUsed: true } });
});
