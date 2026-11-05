import {
  PARTNERSHIP_SELECT,
  REQUEST_DETAILS_SELECT,
  type Limit,
  type LimitForm,
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

export async function deleteLimit(id: string): Promise<void> {
  unwrap(await supabase.from('limits').delete().eq('id', id));
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

export async function castVote(requestId: string, voterId: string, decision: VoteDecision, comment?: string) {
  unwrap(
    await supabase
      .from('request_votes')
      .insert({ request_id: requestId, voter_id: voterId, decision, comment: comment || null }),
  );
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

export async function countAcceptedPartners(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('partnerships')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;
  return count ?? 0;
}
