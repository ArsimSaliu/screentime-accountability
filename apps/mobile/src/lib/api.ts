import {
  PARTNERSHIP_SELECT,
  REQUEST_DETAILS_SELECT,
  type Limit,
  type LimitForm,
  type ProfileSummary,
  type InviteLinkInfo,
  type UserStats,
  type PartnershipWithProfiles,
  type RequestWithDetails,
  type VoteDecision,
} from '@screentime/shared';
import { supabase } from './supabase';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ---------- Limits ----------
export async function listMyLimits(userId: string): Promise<Limit[]> {
  return unwrap(
    await supabase.from('limits').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  );
}

export async function getLimit(id: string): Promise<Limit | null> {
  return unwrap(await supabase.from('limits').select('*').eq('id', id).maybeSingle());
}

/** Create or update a limit; returns its id. */
export async function saveLimit(userId: string, form: LimitForm & { active?: boolean }, id?: string): Promise<string> {
  if (id) {
    unwrap(await supabase.from('limits').update(form).eq('id', id));
    return id;
  }
  const { data, error } = await supabase
    .from('limits')
    .insert({ ...form, user_id: userId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Delete a limit. Active, non-relaxed limits are only *scheduled* for deletion
 * (24 h cooldown); returns 'scheduled' in that case.
 */
export async function deleteLimit(id: string): Promise<'deleted' | 'scheduled'> {
  unwrap(await supabase.from('limits').delete().eq('id', id));
  const still = await getLimit(id);
  return still ? 'scheduled' : 'deleted';
}

/** Cancel a queued loosening (or scheduled deletion) of a limit. */
export async function cancelPendingLimitChange(id: string): Promise<void> {
  unwrap(await supabase.from('limits').update({ pending_change: null }).eq('id', id));
}

// ---------- Requests ----------
export async function createRequest(input: {
  requesterId: string;
  limitId: string | null;
  minutes: number;
  reason?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('extension_requests')
    .insert({
      requester_id: input.requesterId,
      limit_id: input.limitId,
      minutes_requested: input.minutes,
      reason: input.reason || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getRequest(id: string): Promise<RequestWithDetails | null> {
  const data = unwrap(
    await supabase.from('extension_requests').select(REQUEST_DETAILS_SELECT).eq('id', id).maybeSingle(),
  );
  return data as unknown as RequestWithDetails | null;
}

export async function listMyRequests(userId: string, limit = 10): Promise<RequestWithDetails[]> {
  const data = unwrap(
    await supabase
      .from('extension_requests')
      .select(REQUEST_DETAILS_SELECT)
      .eq('requester_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
  return data as unknown as RequestWithDetails[];
}

/** Requests from people I'm an accountability partner for (RLS scopes this). */
export async function listPartnerRequests(userId: string, limit = 30): Promise<RequestWithDetails[]> {
  const data = unwrap(
    await supabase
      .from('extension_requests')
      .select(REQUEST_DETAILS_SELECT)
      .neq('requester_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
  return data as unknown as RequestWithDetails[];
}

/** Vote on a request. `minutes` lets an approving partner offer less than was asked for. */
export async function castVote(
  requestId: string,
  voterId: string,
  decision: VoteDecision,
  comment?: string,
  minutes?: number,
) {
  unwrap(
    await supabase.from('request_votes').insert({
      request_id: requestId,
      voter_id: voterId,
      decision,
      comment: comment || null,
      minutes: decision === 'approve' ? (minutes ?? null) : null,
    }),
  );
}

/** Break-glass unlock: approved immediately, max 15 min, once per 24 h, partners are alerted. */
export async function emergencyUnlock(minutes: number, reason: string, limitId: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('emergency_unlock', {
    p_minutes: minutes,
    p_reason: reason,
    p_limit: limitId,
  });
  if (error) throw error;
  return data;
}

/** Heartbeat + tamper detection: the server alerts partners if access goes from approved to anything else. */
export async function reportScreenTimeStatus(status: string): Promise<void> {
  const { error } = await supabase.rpc('report_screen_time_status', { p_status: status });
  if (error) console.warn('report_screen_time_status failed', error.message);
}

export async function cancelRequest(requestId: string) {
  unwrap(await supabase.rpc('cancel_request', { p_request: requestId }));
}

// ---------- Partners ----------
export async function listPartnerships(): Promise<PartnershipWithProfiles[]> {
  const data = unwrap(
    await supabase.from('partnerships').select(PARTNERSHIP_SELECT).order('created_at', { ascending: true }),
  );
  return data as unknown as PartnershipWithProfiles[];
}

export async function invitePartner(username: string) {
  unwrap(await supabase.rpc('invite_partner', { p_username: username }));
}

export async function acceptInvite(partnershipId: string) {
  unwrap(await supabase.rpc('accept_invite', { p_partnership: partnershipId }));
}

export async function removePartnership(partnershipId: string) {
  unwrap(await supabase.from('partnerships').delete().eq('id', partnershipId));
}

export async function cancelPartnerRemoval(partnershipId: string) {
  unwrap(await supabase.rpc('cancel_partner_removal', { p_partnership: partnershipId }));
}

export async function countAcceptedPartners(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('partnerships')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;
  return count ?? 0;
}

// ---------- Friends I'm a partner for ----------
export type FriendAlert =
  | { type: 'loosening'; at: string; effectiveAt: string; friend: ProfileSummary | null; limitName: string; limit: Limit }
  | { type: 'tamper'; at: string; friend: ProfileSummary | null; kind: string };

export type FriendStatus = ProfileSummary & {
  last_seen_at: string | null;
  screen_time_status: string | null;
  streak_days?: number;
};

/** Alerts (scheduled loosenings, tamper events) and check-in status for people I hold accountable. */
export async function listFriendAlerts(userId: string): Promise<{ alerts: FriendAlert[]; friends: FriendStatus[] }> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [loosening, tamper, partnerships] = await Promise.all([
    supabase
      .from('limits')
      .select('*, owner:profiles!limits_user_id_fkey(id, username, display_name)')
      .neq('user_id', userId)
      .not('pending_effective_at', 'is', null),
    supabase
      .from('tamper_events')
      .select('*, owner:profiles!tamper_events_user_id_fkey(id, username, display_name)')
      .neq('user_id', userId)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false }),
    supabase
      .from('partnerships')
      .select('owner:profiles!partnerships_owner_id_fkey(id, username, display_name, last_seen_at, screen_time_status)')
      .eq('partner_id', userId)
      .eq('status', 'accepted'),
  ]);
  if (loosening.error) throw loosening.error;
  if (tamper.error) throw tamper.error;
  if (partnerships.error) throw partnerships.error;

  const alerts: FriendAlert[] = [
    ...loosening.data.map((l) => ({
      type: 'loosening' as const,
      at: l.pending_effective_at!,
      effectiveAt: l.pending_effective_at!,
      friend: l.owner as ProfileSummary | null,
      limitName: l.name,
      limit: l as unknown as Limit,
    })),
    ...tamper.data.map((t) => ({
      type: 'tamper' as const,
      at: t.created_at,
      friend: t.owner as ProfileSummary | null,
      kind: t.kind,
    })),
  ];
  const friends = partnerships.data
    .map((p) => p.owner as unknown as FriendStatus | null)
    .filter((f): f is FriendStatus => !!f);
  // Partners may read each other's stats (user_stats checks the partnership).
  await Promise.all(
    friends.map(async (f) => {
      const stats = await getStats(f.id).catch(() => null);
      if (stats) f.streak_days = stats.streak_days;
    }),
  );
  return { alerts, friends };
}

// ---------- Stats & account ----------
export async function getStats(userId: string): Promise<UserStats | null> {
  const { data, error } = await supabase.rpc('user_stats', { p_user: userId });
  if (error) throw error;
  return data as UserStats | null;
}

/** Permanently delete the signed-in account (server function verifies the JWT). */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
}

// ---------- Invite links ----------
export async function createInviteLink(): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite_link');
  if (error) throw error;
  return data;
}

export async function getInviteLinkInfo(code: string): Promise<InviteLinkInfo> {
  const { data, error } = await supabase.rpc('invite_link_info', { p_code: code });
  if (error) throw error;
  return data as InviteLinkInfo;
}

export async function acceptInviteLink(code: string): Promise<void> {
  unwrap(await supabase.rpc('accept_invite_link', { p_code: code }));
}

/** Public URL to share; falls back to the app scheme if no web URL is configured. */
export function inviteUrl(code: string): string {
  const web = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, '');
  return web ? `${web}/join/${code}` : `leash://join/${code}`;
}
