import { admin } from './admin.ts';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
};

type ExpoTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

/**
 * Send a push notification to every iOS device registered by the given users,
 * via the Expo Push Service. Returns the user ids that had at least one device.
 */
export async function pushToUsers(userIds: string[], msg: PushMessage): Promise<Set<string>> {
  const reached = new Set<string>();
  if (userIds.length === 0) return reached;

  const { data: tokens, error } = await admin
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', userIds)
    .eq('platform', 'ios');
  if (error) {
    console.error('pushToUsers: token lookup failed', error.message);
    return reached;
  }
  if (!tokens?.length) return reached;

  const messages = tokens.map((t) => ({
    to: t.token,
    title: msg.title,
    body: msg.body,
    data: msg.data ?? {},
    sound: 'default',
    priority: 'high',
    ...(msg.categoryId ? { categoryId: msg.categoryId } : {}),
  }));

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error('Expo push failed', res.status, await res.text());
      continue;
    }
    const { data: tickets } = (await res.json()) as { data: ExpoTicket[] };
    const dead: string[] = [];
    tickets.forEach((ticket, idx) => {
      const tok = tokens[i + idx];
      if (ticket.status === 'ok') reached.add(tok.user_id);
      else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(tok.token);
      else console.error('Expo ticket error', ticket.message);
    });
    if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  }
  return reached;
}
