'use server';

import { usernameSchema, voteSchema } from '@screentime/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from './data';

export type ActionState = { error?: string; ok?: boolean } | undefined;

function message(err: { message?: string; code?: string } | null): string | undefined {
  if (!err) return undefined;
  if (err.code === '23505') return 'That already exists.';
  return err.message ?? 'Something went wrong';
}

export async function voteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser();
  const requestId = String(formData.get('requestId'));
  const parsed = voteSchema.safeParse({
    decision: formData.get('decision'),
    comment: formData.get('comment') || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.from('request_votes').insert({
    request_id: requestId,
    voter_id: userId,
    decision: parsed.data.decision,
    comment: parsed.data.comment || null,
  });
  if (error) {
    return { error: error.code === '42501' ? 'This request can no longer be voted on.' : message(error) };
  }
  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function cancelRequestAction(formData: FormData) {
  const { supabase } = await requireUser();
  const requestId = String(formData.get('requestId'));
  await supabase.rpc('cancel_request', { p_request: requestId });
  revalidatePath(`/requests/${requestId}`);
}

export async function invitePartnerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const parsed = usernameSchema.safeParse(String(formData.get('username') ?? '').replace(/^@/, ''));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await supabase.rpc('invite_partner', { p_username: parsed.data });
  if (error) return { error: message(error) };
  revalidatePath('/partners');
  return { ok: true };
}

export async function acceptInviteAction(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.rpc('accept_invite', { p_partnership: String(formData.get('id')) });
  revalidatePath('/partners');
}

export async function removePartnershipAction(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from('partnerships').delete().eq('id', String(formData.get('id')));
  revalidatePath('/partners');
}

export async function cancelPartnerRemovalAction(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.rpc('cancel_partner_removal', { p_partnership: String(formData.get('id')) });
  revalidatePath('/partners');
}

export async function cancelPendingLimitChangeAction(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.from('limits').update({ pending_change: null }).eq('id', String(formData.get('id')));
  revalidatePath('/dashboard');
}

export async function onboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await requireUser({ allowNotOnboarded: true });
  const parsed = usernameSchema.safeParse(formData.get('username'));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const displayName = String(formData.get('display_name') ?? '').trim().slice(0, 50) || null;
  const timezone = String(formData.get('timezone') ?? '') || 'UTC';

  const { error } = await supabase
    .from('profiles')
    .update({ username: parsed.data, display_name: displayName, timezone, onboarded: true })
    .eq('id', userId);
  if (error) return { error: error.code === '23505' ? 'That username is taken' : message(error) };
  redirect('/dashboard');
}
