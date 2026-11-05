import type { Limit, PendingLimitChange, ProfileSummary, RequestStatus, UserStats } from './models';

export function displayName(p: ProfileSummary | null | undefined): string {
  if (!p) return 'Someone';
  return p.display_name?.trim() || `@${p.username}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/** "3 min ago" / "in 12 min" style relative time. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60000);
  if (diffMin === 0) return 'just now';
  const abs = Math.abs(diffMin);
  const unit = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return diffMin < 0 ? `${unit} ago` : `in ${unit}`;
}

/** "raise to 90 min, pause" style summary of a queued limit change, or null if none. */
export function describePendingChange(limit: Pick<Limit, 'pending_change'>): string | null {
  const c = limit.pending_change as PendingLimitChange | null;
  if (!c) return null;
  if (c.delete) return 'delete this limit';
  const parts: string[] = [];
  if (c.minutes !== undefined) parts.push(`raise to ${formatMinutes(c.minutes)}`);
  if (c.strictness !== undefined) parts.push(`strictness → ${c.strictness}`);
  if (c.approvals_required !== undefined) parts.push(`approvals → ${c.approvals_required}`);
  if (c.active === false) parts.push('pause');
  if (c.kind === 'session') parts.push('switch to per-session');
  return parts.length ? parts.join(', ') : null;
}

export function formatStreak(days: number): string {
  return `${days >= 7 ? '🔥 ' : ''}${days} day${days === 1 ? '' : 's'}`;
}

/** One-line summary of the last 7 days. */
export function summarizeWeek(stats: UserStats): string {
  const w = stats.week;
  if (!w.requests && !w.emergencies) return 'No extra time requested this week';
  const parts = [`${w.requests} request${w.requests === 1 ? '' : 's'}`, `${w.approved} approved`];
  if (w.minutes_granted) parts.push(`${formatMinutes(w.minutes_granted)} extra`);
  if (w.emergencies) parts.push(`${w.emergencies} emergency`);
  return parts.join(' · ');
}
