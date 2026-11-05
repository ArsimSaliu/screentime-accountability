// Sunday summary for every onboarded user. Triggered by pg_cron (see *_weekly_digest.sql)
// with the same shared secret as `notify`.
import { admin } from '../_shared/admin.ts';
import { summarize, type Stats } from '../_shared/digest.ts';
import { notifyUsers } from '../_shared/partners.ts';

const PAGE = 500;

Deno.serve(async (req) => {
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  let sent = 0;
  let failed = 0;
  for (let from = 0; ; from += PAGE) {
    const { data: users, error } = await admin
      .from('profiles')
      .select('id')
      .eq('onboarded', true)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('weekly-digest: profile page failed', error.message);
      return new Response('error', { status: 500 });
    }
    if (!users?.length) break;

    for (const { id } of users) {
      try {
        const { data, error: statsErr } = await admin.rpc('user_stats', { p_user: id });
        if (statsErr || !data) throw statsErr ?? new Error('no stats');
        const { title, body } = summarize(data as Stats);
        await notifyUsers([id], title, body, { kind: 'weekly_digest' });
        sent++;
      } catch (e) {
        failed++;
        console.error('weekly-digest: user failed', id, e);
      }
    }
    if (users.length < PAGE) break;
  }

  return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } });
});
