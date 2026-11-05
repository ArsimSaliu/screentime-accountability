import 'server-only';
import {
  PARTNERSHIP_SELECT,
  REQUEST_DETAILS_SELECT,
  type PartnershipWithProfiles,
  type Profile,
  type RequestWithDetails,
} from '@screentime/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from './supabase/server';

/** Current user + profile, or redirect to /login. Deduped per request. */
export const requireUser = cache(async (opts: { allowNotOnboarded?: boolean } = {}) => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (!profile) redirect('/login');
  if (!profile.onboarded && !opts.allowNotOnboarded) redirect('/onboarding');

  return { supabase, userId, profile: profile as Profile, email: (data.claims.email as string) ?? null };
});

export async function getDashboard() {
  const { supabase, userId, profile } = await requireUser();
  const [limits, mine, partnerReqs, partnerCount] = await Promise.all([
    supabase.from('limits').select('*').eq('user_id', userId).order('created_at'),
    supabase
      .from('extension_requests')
      .select(REQUEST_DETAILS_SELECT)
      .eq('requester_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('extension_requests')
      .select(REQUEST_DETAILS_SELECT)
      .neq('requester_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('partnerships')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('status', 'accepted'),
  ]);

  return {
    now: Date.now(),
    userId,
    profile,
    limits: limits.data ?? [],
    myRequests: (mine.data ?? []) as unknown as RequestWithDetails[],
    partnerRequests: (partnerReqs.data ?? []) as unknown as RequestWithDetails[],
    partnerCount: partnerCount.count ?? 0,
  };
}

export async function getRequestDetails(id: string) {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from('extension_requests').select(REQUEST_DETAILS_SELECT).eq('id', id).maybeSingle();
  return { now: Date.now(), userId, request: data as unknown as RequestWithDetails | null };
}

export async function getPartnerships() {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from('partnerships').select(PARTNERSHIP_SELECT).order('created_at');
  return { userId, partnerships: (data ?? []) as unknown as PartnershipWithProfiles[] };
}
