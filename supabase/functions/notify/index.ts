// Called by Postgres triggers (see migrations/*_notifications.sql) via pg_net.
// Fans out push notifications and magic-link emails.
import { admin, displayName, getEmail, getProfile } from '../_shared/admin.ts';
import { escapeHtml, sendEmail } from '../_shared/email.ts';
import { alertPartners } from '../_shared/partners.ts';
import { pushToUsers } from '../_shared/push.ts';
import { randomToken, sha256Hex } from '../_shared/tokens.ts';

type Payload = {
  type: 'INSERT' | 'UPDATE';
  table: 'extension_requests' | 'partnerships' | 'limits' | 'tamper_events';
  record: Record<string, any>;
  old_record: Record<string, any> | null;
};

const TIME_REQUEST_CATEGORY = 'TIME_REQUEST';
const WEB_URL = (Deno.env.get('WEB_URL') ?? '').replace(/\/$/, '');

Deno.serve(async (req) => {
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = (await req.json()) as Payload;
  try {
    if (payload.table === 'extension_requests' && payload.type === 'INSERT' && payload.record.emergency) {
      await onEmergencyUnlock(payload.record);
    } else if (payload.table === 'extension_requests' && payload.type === 'INSERT') {
      await onRequestCreated(payload.record);
    } else if (payload.table === 'extension_requests' && payload.type === 'UPDATE') {
      await onRequestResolved(payload.record);
    } else if (payload.table === 'partnerships' && payload.type === 'INSERT') {
      await onInviteCreated(payload.record);
    } else if (payload.table === 'partnerships' && payload.type === 'UPDATE') {
      if (payload.record.removal_effective_at && !payload.old_record?.removal_effective_at) {
        await onPartnerRemovalScheduled(payload.record);
      } else if (payload.record.status === 'accepted' && payload.old_record?.status === 'pending') {
        await onInviteAccepted(payload.record);
      }
    } else if (payload.table === 'limits' && payload.type === 'UPDATE') {
      await onLimitLooseningScheduled(payload.record);
    } else if (payload.table === 'tamper_events' && payload.type === 'INSERT') {
      await onTamperEvent(payload.record);
    }
  } catch (err) {
    console.error('notify failed', payload.table, payload.type, err);
    return new Response('error', { status: 500 });
  }
  return new Response('ok');
});

function formatWhen(iso: string): string {
  const hours = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000));
  return `in about ${hours} h`;
}

function describePending(change: Record<string, unknown>): string {
  if (change.delete) return 'delete it';
  const parts: string[] = [];
  if (change.minutes !== undefined) parts.push(`raise it to ${change.minutes} min`);
  if (change.strictness !== undefined) parts.push(`make it ${change.strictness}`);
  if (change.approvals_required !== undefined) parts.push(`need only ${change.approvals_required} approval(s)`);
  if (change.active === false) parts.push('pause it');
  if (change.kind === 'session') parts.push('switch it to per-session');
  return parts.join(', ') || 'loosen it';
}

async function onEmergencyUnlock(request: Record<string, any>) {
  const name = displayName(await getProfile(request.requester_id));
  await alertPartners(
    request.requester_id,
    `🚨 ${name} used an emergency unlock`,
    `${request.minutes_granted} min without approval. Reason: “${request.reason ?? 'none'}”`,
    { kind: 'request_created', requestId: request.id },
  );
}

async function onLimitLooseningScheduled(limit: Record<string, any>) {
  if (!limit.pending_change || !limit.pending_effective_at) return;
  const name = displayName(await getProfile(limit.user_id));
  await alertPartners(
    limit.user_id,
    `${name} is loosening a limit`,
    `They want to ${describePending(limit.pending_change)} for “${limit.name}”. It takes effect ${formatWhen(limit.pending_effective_at)}.`,
    { kind: 'limit_loosening', limitId: limit.id },
  );
}

async function onPartnerRemovalScheduled(partnership: Record<string, any>) {
  const name = displayName(await getProfile(partnership.owner_id));
  await alertPartners(
    partnership.owner_id,
    `${name} is removing a partner`,
    `One of ${name}'s accountability partners will be removed ${formatWhen(partnership.removal_effective_at)}.`,
    { kind: 'partner_removal', partnershipId: partnership.id },
  );
}

async function onTamperEvent(event: Record<string, any>) {
  const name = displayName(await getProfile(event.user_id));
  if (event.kind === 'screen_time_revoked') {
    await alertPartners(
      event.user_id,
      `⚠️ ${name} turned off app blocking`,
      `${name} removed Leash's Screen Time access, so their limits aren't being enforced right now.`,
      { kind: 'tamper', eventId: event.id },
    );
  } else if (event.kind === 'screen_time_restored') {
    await alertPartners(event.user_id, `${name} turned app blocking back on`, 'Their limits are enforced again.', {
      kind: 'tamper',
      eventId: event.id,
    });
  }
}

async function onRequestCreated(request: Record<string, any>) {
  const requester = await getProfile(request.requester_id);
  const name = displayName(requester);

  const { data: partners, error } = await admin
    .from('partnerships')
    .select('partner_id')
    .eq('owner_id', request.requester_id)
    .eq('status', 'accepted');
  if (error) throw error;
  const partnerIds = (partners ?? []).map((p) => p.partner_id as string);
  if (partnerIds.length === 0) return;

  const reasonLine = request.reason ? `“${request.reason}”` : 'No reason given.';
  const reached = await pushToUsers(partnerIds, {
    title: `${name} wants ${request.minutes_requested} more minutes`,
    body: reasonLine,
    categoryId: TIME_REQUEST_CATEGORY,
    data: { kind: 'request_created', requestId: request.id },
  });

  // Partners without the app (or whose push failed) get an email with a one-tap link.
  if (!WEB_URL) return;
  const emailTargets = partnerIds.filter((id) => !reached.has(id));
  await Promise.all(
    emailTargets.map(async (partnerId) => {
      const email = await getEmail(partnerId);
      if (!email) return;

      const token = randomToken();
      const { error: tokErr } = await admin.from('vote_tokens').insert({
        token_hash: await sha256Hex(token),
        request_id: request.id,
        voter_id: partnerId,
        expires_at: request.expires_at,
      });
      if (tokErr) {
        console.error('vote token insert failed', tokErr.message);
        return;
      }

      const link = `${WEB_URL}/v/${token}`;
      await sendEmail(
        email,
        `${name} is asking for ${request.minutes_requested} more minutes`,
        `<p><strong>${escapeHtml(name)}</strong> hit their screen time limit and is asking for
         <strong>${request.minutes_requested} more minutes</strong>.</p>
         <p>${escapeHtml(reasonLine)}</p>
         <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Approve or deny</a></p>
         <p style="color:#666;font-size:12px">This link works once and expires in 30 minutes.</p>`,
      );
    }),
  );
}

async function onRequestResolved(request: Record<string, any>) {
  const status = request.status as string;
  const messages: Record<string, { title: string; body: string }> = {
    approved: {
      title: 'Approved ✅',
      body: `You've got ${request.minutes_granted ?? request.minutes_requested} more minutes. Tap to unlock.`,
    },
    denied: { title: 'Request denied', body: 'Your partners said no this time. Hang in there.' },
    expired: { title: 'Request expired', body: 'Nobody responded in time.' },
  };
  const msg = messages[status];
  if (!msg) return; // cancelled by the requester: nothing to tell them

  await pushToUsers([request.requester_id], {
    ...msg,
    data: {
      kind: 'request_resolved',
      requestId: request.id,
      status,
      minutesGranted: request.minutes_granted,
    },
  });
}

async function onInviteCreated(partnership: Record<string, any>) {
  const owner = await getProfile(partnership.owner_id);
  const name = displayName(owner);
  const reached = await pushToUsers([partnership.partner_id], {
    title: 'New accountability request',
    body: `${name} wants you to approve their screen time extensions.`,
    data: { kind: 'invite_received', partnershipId: partnership.id },
  });

  if (!reached.size && WEB_URL) {
    const email = await getEmail(partnership.partner_id);
    if (email) {
      await sendEmail(
        email,
        `${name} wants you as an accountability partner`,
        `<p><strong>${escapeHtml(name)}</strong> wants you to approve or deny their screen time extensions.</p>
         <p><a href="${WEB_URL}/partners">Review the invite</a></p>`,
      );
    }
  }
}

async function onInviteAccepted(partnership: Record<string, any>) {
  const partner = await getProfile(partnership.partner_id);
  await pushToUsers([partnership.owner_id], {
    title: 'Partner added 🎉',
    body: `${displayName(partner)} is now your accountability partner.`,
    data: { kind: 'invite_accepted', partnershipId: partnership.id },
  });
}
