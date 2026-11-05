import { summarize, type Stats } from './digest.ts';

const base: Stats = {
  streak_days: 3,
  best_streak_days: 3,
  week: { requests: 0, approved: 0, denied: 0, expired: 0, emergencies: 0, minutes_granted: 0 },
  partner: { votes: 0, approvals: 0, avg_response_minutes: null },
};

function eq(a: unknown, b: unknown, label: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${label}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

Deno.test('quiet week', () => {
  eq(summarize(base), { title: 'Your week: 3-day streak', body: 'No extra time requested this week. Nice!' }, 'quiet');
});

Deno.test('busy week with emergency, best streak and partner votes', () => {
  const s = summarize({
    streak_days: 0,
    best_streak_days: 9,
    week: { requests: 3, approved: 2, denied: 1, expired: 0, emergencies: 1, minutes_granted: 25 },
    partner: { votes: 1, approvals: 1, avg_response_minutes: 2 },
  });
  eq(s.title, 'Your week in screen time', 'title');
  eq(
    s.body,
    '3 requests: 2 approved, 1 denied (25 min extra). 1 emergency unlock. Best streak: 9 days. You answered 1 friend request.',
    'body',
  );
});

Deno.test('long streak gets fire', () => {
  eq(summarize({ ...base, streak_days: 8, best_streak_days: 8 }).title, '🔥 8-day streak!', 'fire');
});
