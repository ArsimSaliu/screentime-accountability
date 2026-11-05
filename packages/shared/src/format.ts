import type { ProfileSummary, RequestStatus } from './models';

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
