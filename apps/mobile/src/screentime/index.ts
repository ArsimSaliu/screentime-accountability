/**
 * Screen Time bridge built on `react-native-device-activity`
 * (FamilyControls + DeviceActivity + ManagedSettings).
 *
 * Model, per limit (`daily` and `downtime` limits block; `session` can't be expressed on iOS):
 *   selection id   limit_<id>       the apps/categories the user picked (stored in the App Group)
 *   main activity  limit_<id>       repeats 00:00–23:59; when usage hits `minutes` the
 *                                   DeviceActivityMonitor extension shields the selection,
 *                                   and at midnight (intervalDidStart) it unshields again.
 *   downtime       limit_<id>       shields at the window start, unshields at the end; a window
 *                  limit_<id>_late  that crosses midnight is split into two activities.
 *   ext activity   limit_<id>_ext   created when an extension is approved: unshield now,
 *                                   re-shield after N more minutes of usage.
 *
 * Activity names must *contain* the selection id so the shield extensions can tell which
 * selection a shield belongs to (library requirement).
 *
 * Everything that has to happen while the app is closed runs natively in the extensions;
 * JS only (re)configures them.
 */
import type { Limit } from '@screentime/shared';
import { Platform } from 'react-native';
import * as RNDA from 'react-native-device-activity';

export type ScreenTimeStatus = 'unsupported' | 'notDetermined' | 'denied' | 'approved';

/** Category of the local notification sent when the user taps "Ask for more time" on a shield. */
export const SHIELD_REQUEST_CATEGORY = 'LEASH_SHIELD_REQUEST';

const PREFIX = 'limit_';
const EXT_SUFFIX = '_ext';
const LIMIT_EVENT = 'limit_reached';
const EXT_EVENT = 'extension_used';
const CONFIG_KEY = (limitId: string) => `leash_cfg_${limitId}`;

const LATE_SUFFIX = '_late';
const selectionId = (limitId: string) => `${PREFIX}${limitId}`;
const mainActivity = selectionId;
const lateActivity = (limitId: string) => `${selectionId(limitId)}${LATE_SUFFIX}`;
const extActivity = (limitId: string) => `${selectionId(limitId)}${EXT_SUFFIX}`;
const ID_RE = /^limit_([0-9a-f-]{36})/;

function supported(): boolean {
  try {
    return Platform.OS === 'ios' && RNDA.isAvailable();
  } catch {
    return false;
  }
}

function mapStatus(s: number): ScreenTimeStatus {
  if (s === RNDA.AuthorizationStatus.approved) return 'approved';
  if (s === RNDA.AuthorizationStatus.denied) return 'denied';
  return 'notDetermined';
}

/** DateComponents for a duration (DeviceActivity thresholds want hour/minute split). */
function duration(minutes: number) {
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

/** Cheap stable hash so we only restart monitoring when a limit's config really changes. */
function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Minute-of-day (0–1440) at which an extension's re-block monitor should stop.
 * Exported for tests. Reads the window saved by syncLimits (CONFIG_KEY = kind:minutes:start:end:hash).
 */
export function extensionEndFor(cfg: string | undefined, nowMinute: number): number {
  const [kind, , start, end] = (cfg ?? '').split(':');
  if (kind !== 'downtime') return 1440;
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 1440;
  if (e === 0 || s === e) return 1440; // window ends at midnight
  // Before the window's end time (same-day window, or the morning part of one that crosses
  // midnight) the block ends at `e`; otherwise it runs to midnight.
  return nowMinute < e ? e : 1440;
}

function extensionEndMinute(limitId: string, nowMinute: number): number {
  return extensionEndFor(RNDA.userDefaultsGet<string>(CONFIG_KEY(limitId)), nowMinute);
}

const DAY_SCHEDULE = {
  intervalStart: { hour: 0, minute: 0, second: 0 },
  intervalEnd: { hour: 23, minute: 59, second: 59 },
  repeats: true,
};

let shieldConfigured = false;

/** Branded shield. Primary button posts a local notification that opens /request/new. */
function configureShield() {
  if (shieldConfigured) return;
  RNDA.updateShield(
    {
      title: "Time's up for {applicationOrDomainDisplayName}",
      subtitle: 'You reached your limit. Need more? Ask your accountability partners.',
      primaryButtonLabel: 'Ask for more time',
      secondaryButtonLabel: 'OK',
      iconSystemName: 'hourglass',
      backgroundBlurStyle: RNDA.UIBlurEffectStyle.systemMaterialDark,
      titleColor: { red: 255, green: 255, blue: 255 },
      subtitleColor: { red: 200, green: 205, blue: 215 },
      primaryButtonBackgroundColor: { red: 99, green: 102, blue: 241 },
      primaryButtonLabelColor: { red: 255, green: 255, blue: 255 },
    },
    {
      primary: {
        behavior: 'close',
        actions: [
          {
            type: 'sendNotification',
            payload: {
              title: 'Need more time?',
              body: 'Tap to ask your partners for an extension.',
              sound: 'default',
              categoryIdentifier: SHIELD_REQUEST_CATEGORY,
              userInfo: { kind: 'shield_request' },
            },
          },
        ],
      },
      secondary: { behavior: 'close' },
    },
  );
  shieldConfigured = true;
}

function limitIdsOnDevice(): string[] {
  const ids = new Set<string>();
  for (const a of RNDA.getActivities()) {
    const m = ID_RE.exec(a);
    if (m && !a.endsWith(EXT_SUFFIX)) ids.add(m[1]);
  }
  return [...ids];
}

const clock = (minute: number, second = 0) => ({ hour: Math.floor(minute / 60), minute: minute % 60, second });

/** Shield during [start, end) every day; split in two when the window crosses midnight. */
async function startDowntime(id: string, start: number, end: number) {
  const block = [{ type: 'blockSelection' as const, familyActivitySelectionId: selectionId(id) }];
  const unblock = [{ type: 'unblockSelection' as const, familyActivitySelectionId: selectionId(id) }];
  // A window ending exactly at 00:00 doesn't really cross midnight: it ends at 23:59:59.
  const crosses = end < start && end > 0;
  const mainEnd = crosses || end === 0 ? { hour: 23, minute: 59, second: 59 } : clock(end);

  // Evening part (or the whole window when it doesn't cross midnight).
  RNDA.configureActions({ activityName: mainActivity(id), callbackName: 'intervalDidStart', actions: block });
  RNDA.configureActions({
    activityName: mainActivity(id),
    callbackName: 'intervalDidEnd',
    // When crossing midnight the late part takes over at 00:00, so don't unblock here.
    actions: crosses ? [] : unblock,
  });
  await RNDA.startMonitoring(
    mainActivity(id),
    { intervalStart: clock(start), intervalEnd: mainEnd, repeats: true },
    [],
  );

  if (crosses) {
    RNDA.configureActions({ activityName: lateActivity(id), callbackName: 'intervalDidStart', actions: block });
    RNDA.configureActions({ activityName: lateActivity(id), callbackName: 'intervalDidEnd', actions: unblock });
    await RNDA.startMonitoring(
      lateActivity(id),
      { intervalStart: { hour: 0, minute: 0, second: 0 }, intervalEnd: clock(end), repeats: true },
      [],
    );
  }
}

function tearDown(limitId: string) {
  RNDA.stopMonitoring([mainActivity(limitId), lateActivity(limitId), extActivity(limitId)]);
  RNDA.unblockSelection({ activitySelectionId: selectionId(limitId) }, 'leash:teardown');
  RNDA.cleanUpAfterActivity(mainActivity(limitId));
  RNDA.cleanUpAfterActivity(lateActivity(limitId));
  RNDA.cleanUpAfterActivity(extActivity(limitId));
  RNDA.userDefaultsRemove(CONFIG_KEY(limitId));
}

export const ScreenTime = {
  get isAvailable(): boolean {
    return supported();
  },

  getAuthorizationStatus(): ScreenTimeStatus {
    if (!supported()) return 'unsupported';
    return mapStatus(RNDA.getAuthorizationStatus());
  },

  /** Ask for FamilyControls authorization for *this* user (individual, not parental). */
  async requestAuthorization(): Promise<ScreenTimeStatus> {
    if (!supported()) return 'unsupported';
    await RNDA.requestAuthorization('individual');
    // Status can lag behind the system prompt; poll briefly.
    return mapStatus(await RNDA.pollAuthorizationStatus({ maxAttempts: 10, pollIntervalMs: 300 }));
  },

  /** The stored app/category selection token for a limit, if any. */
  getSelection(limitId: string): string | null {
    if (!supported()) return null;
    return RNDA.getFamilyActivitySelectionId(selectionId(limitId)) ?? null;
  },

  saveSelection(limitId: string, token: string) {
    if (!supported()) return;
    RNDA.setFamilyActivitySelectionId({ id: selectionId(limitId), familyActivitySelection: token });
  },

  /** Human summary of a selection token, e.g. "3 apps · 1 category". */
  describeSelection(token: string | null): string {
    if (!token || !supported()) return 'No apps chosen';
    const m = RNDA.activitySelectionMetadata({ activitySelectionToken: token });
    if (!m) return 'No apps chosen';
    const parts: string[] = [];
    if (m.applicationCount) parts.push(`${m.applicationCount} app${m.applicationCount === 1 ? '' : 's'}`);
    if (m.categoryCount) parts.push(`${m.categoryCount} categor${m.categoryCount === 1 ? 'y' : 'ies'}`);
    if (m.webDomainCount) parts.push(`${m.webDomainCount} site${m.webDomainCount === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'No apps chosen';
  },

  /**
   * Make the device match the server's limits: start monitoring new/changed limits, stop
   * removed/paused ones. Safe to call often; unchanged limits are left alone so an active
   * extension isn't overwritten.
   */
  async syncLimits(limits: Limit[]): Promise<void> {
    if (!supported() || this.getAuthorizationStatus() !== 'approved') return;
    configureShield();

    const wanted = new Map<string, { limit: Limit; token: string }>();
    for (const limit of limits) {
      const token = this.getSelection(limit.id);
      // Session limits can't be expressed with DeviceActivity: daily and downtime only.
      if (limit.active && limit.kind !== 'session' && token) wanted.set(limit.id, { limit, token });
    }

    for (const id of limitIdsOnDevice()) {
      if (!wanted.has(id)) tearDown(id);
    }

    for (const [id, { limit, token }] of wanted) {
      const cfg = `${limit.kind}:${limit.minutes}:${limit.start_minute}:${limit.end_minute}:${hash(token)}`;
      const running = RNDA.getActivities().includes(mainActivity(id));
      if (running && RNDA.userDefaultsGet<string>(CONFIG_KEY(id)) === cfg) continue;

      RNDA.stopMonitoring([mainActivity(id), lateActivity(id)]);
      if (limit.kind === 'downtime' && limit.start_minute != null && limit.end_minute != null) {
        await startDowntime(id, limit.start_minute, limit.end_minute);
        RNDA.userDefaultsSet(CONFIG_KEY(id), cfg);
        continue;
      }
      RNDA.configureActions({
        activityName: mainActivity(id),
        callbackName: 'eventDidReachThreshold',
        eventName: LIMIT_EVENT,
        actions: [{ type: 'blockSelection', familyActivitySelectionId: selectionId(id) }],
      });
      RNDA.configureActions({
        activityName: mainActivity(id),
        callbackName: 'intervalDidStart',
        actions: [{ type: 'unblockSelection', familyActivitySelectionId: selectionId(id) }],
      });
      await RNDA.startMonitoring(mainActivity(id), DAY_SCHEDULE, [
        {
          eventName: LIMIT_EVENT,
          familyActivitySelection: token,
          threshold: duration(limit.minutes),
          // Count usage from earlier today too, so editing a limit mid-day is honest.
          includesPastActivity: true,
        },
      ]);
      RNDA.userDefaultsSet(CONFIG_KEY(id), cfg);
    }
  },

  /**
   * An extension was approved: lift the shield now and re-shield after `minutes` more
   * minutes of usage. `limitId === null` (a "general" request) applies to every limit.
   */
  async grantExtension(requestId: string, minutes: number, limitId: string | null): Promise<void> {
    if (!supported() || this.getAuthorizationStatus() !== 'approved') {
      console.log(`[ScreenTime] not available: would unlock ${minutes} min (request ${requestId})`);
      return;
    }
    const ids = limitId ? [limitId] : limitIdsOnDevice();
    const now = new Date();
    const nowMinute = now.getHours() * 60 + now.getMinutes();

    for (const id of ids) {
      const token = this.getSelection(id);
      if (!token) continue;

      RNDA.stopMonitoring([extActivity(id)]);
      RNDA.unblockSelection({ activitySelectionId: selectionId(id) }, `leash:extension:${requestId}`);

      // The re-block monitor must stop when the block would have ended anyway: midnight for
      // daily limits, the end of the current window for downtime (otherwise it could
      // re-shield apps in the middle of the day, after downtime is over).
      const endMinute = extensionEndMinute(id, nowMinute);
      // DeviceActivity rejects intervals under 15 minutes; the block ends soon anyway, so
      // just leave the apps unblocked until then.
      if (endMinute - nowMinute < 15) continue;

      RNDA.configureActions({
        activityName: extActivity(id),
        callbackName: 'eventDidReachThreshold',
        eventName: EXT_EVENT,
        actions: [{ type: 'blockSelection', familyActivitySelectionId: selectionId(id) }],
      });
      await RNDA.startMonitoring(
        extActivity(id),
        {
          intervalStart: { hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds() },
          intervalEnd: endMinute >= 1440 ? { hour: 23, minute: 59, second: 59 } : clock(endMinute),
          repeats: false,
        },
        [{ eventName: EXT_EVENT, familyActivitySelection: token, threshold: duration(minutes) }],
      );
    }
  },

  /** Remove every block and monitor this app created (used on sign-out). */
  reset() {
    if (!supported()) return;
    for (const id of limitIdsOnDevice()) tearDown(id);
  },
};
