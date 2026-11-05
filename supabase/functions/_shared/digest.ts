export type Stats = {
  streak_days: number;
  best_streak_days: number;
  week: { requests: number; approved: number; denied: number; expired: number; emergencies: number; minutes_granted: number };
  partner: { votes: number; approvals: number; avg_response_minutes: number | null };
};

export function summarize(s: Stats): { title: string; body: string } {
  const title =
    s.streak_days >= 7
      ? `🔥 ${s.streak_days}-day streak!`
      : s.streak_days > 0
        ? `Your week: ${s.streak_days}-day streak`
        : 'Your week in screen time';

  const parts: string[] = [];
  if (s.week.requests === 0 && s.week.emergencies === 0) {
    parts.push('No extra time requested this week. Nice!');
  } else {
    parts.push(
      `${s.week.requests} request${s.week.requests === 1 ? '' : 's'}: ${s.week.approved} approved, ${s.week.denied} denied` +
        (s.week.minutes_granted ? ` (${s.week.minutes_granted} min extra)` : '') +
        '.',
    );
    if (s.week.emergencies) parts.push(`${s.week.emergencies} emergency unlock${s.week.emergencies === 1 ? '' : 's'}.`);
  }
  if (s.best_streak_days > s.streak_days) parts.push(`Best streak: ${s.best_streak_days} days.`);
  if (s.partner.votes) parts.push(`You answered ${s.partner.votes} friend request${s.partner.votes === 1 ? '' : 's'}.`);
  return { title, body: parts.join(' ') };
}
