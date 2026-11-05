import { ExtensionStorage } from '@kingstinct/expo-apple-targets';
import { formatClock, type Limit, type RequestWithDetails, type UserStats } from '@screentime/shared';
import * as RNDA from 'react-native-device-activity';
import { ScreenTime } from '../screentime';

/** Mirrors `LeashState` in targets/LeashWidget/LeashWidget.swift. Times are Unix seconds. */
export type WidgetState = {
  streakDays: number;
  bestStreakDays: number;
  pendingRequestId: string | null;
  pendingMinutes: number | null;
  pendingExpiresAt: number | null;
  downtime: string | null;
  updatedAt: number;
};

const KEY = 'leash_widget';
let last = '';

/** Build the widget payload from what Home already loaded. */
export function widgetStateFrom(
  stats: UserStats | null,
  requests: RequestWithDetails[],
  limits: Limit[],
  now = Date.now(),
): WidgetState {
  const pending = requests.find((r) => r.status === 'pending' && new Date(r.expires_at).getTime() > now);
  const downtime = limits.find((l) => l.active && l.kind === 'downtime' && l.start_minute != null && l.end_minute != null);
  return {
    streakDays: stats?.streak_days ?? 0,
    bestStreakDays: stats?.best_streak_days ?? 0,
    pendingRequestId: pending?.id ?? null,
    pendingMinutes: pending?.minutes_requested ?? null,
    pendingExpiresAt: pending ? Math.floor(new Date(pending.expires_at).getTime() / 1000) : null,
    downtime: downtime ? `${formatClock(downtime.start_minute!)}–${formatClock(downtime.end_minute!)}` : null,
    updatedAt: Math.floor(now / 1000),
  };
}

/**
 * Write the state to the shared App Group (read by the widget extension) and ask
 * WidgetKit to refresh, but only when something actually changed.
 */
export function updateWidget(state: WidgetState) {
  if (!ScreenTime.isAvailable) return; // needs the native module + App Group (dev/prod build)
  const { updatedAt: _ignored, ...comparable } = state;
  const fingerprint = JSON.stringify(comparable);
  if (fingerprint === last) return;
  last = fingerprint;
  try {
    RNDA.userDefaultsSet(KEY, JSON.stringify(state));
    ExtensionStorage.reloadWidget();
  } catch (e) {
    console.warn('updateWidget failed', e);
  }
}
