import { admin, getEmail } from './admin.ts';
import { escapeHtml, sendEmail } from './email.ts';
import { pushToUsers } from './push.ts';

const WEB_URL = (Deno.env.get('WEB_URL') ?? '').replace(/\/$/, '');

export async function acceptedPartnerIds(ownerId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('partnerships')
    .select('partner_id')
    .eq('owner_id', ownerId)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data ?? []).map((p) => p.partner_id as string);
}

/** Push to a user's accepted partners, falling back to email for those without the app. */
export async function alertPartners(ownerId: string, title: string, body: string, data: Record<string, unknown>) {
  const partnerIds = await acceptedPartnerIds(ownerId);
  if (!partnerIds.length) return;
  await notifyUsers(partnerIds, title, body, data);
}

/** Push to users, falling back to email (with a dashboard link) for those not reached. */
export async function notifyUsers(userIds: string[], title: string, body: string, data: Record<string, unknown>) {
  const reached = await pushToUsers(userIds, { title, body, data });
  if (!WEB_URL) return;
  await Promise.all(
    userIds
      .filter((id) => !reached.has(id))
      .map(async (id) => {
        const email = await getEmail(id);
        if (email) {
          await sendEmail(
            email,
            title,
            `<p>${escapeHtml(body)}</p><p><a href="${WEB_URL}/dashboard">Open your dashboard</a></p>`,
          );
        }
      }),
  );
}
