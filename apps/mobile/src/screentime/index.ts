/**
 * Screen Time bridge (Phase 3).
 *
 * Right now this is a no-op so the approval loop can be built and tested
 * without Apple's Family Controls entitlement. In Phase 3 this file will wrap
 * `react-native-device-activity` to:
 *   - request FamilyControls (.individual) authorization
 *   - present the FamilyActivityPicker and persist the selection in the App Group
 *   - schedule DeviceActivity thresholds per limit (the monitor extension shields apps)
 *   - lift the shield for N minutes when an extension request is approved
 */
export type ScreenTimeStatus = 'unsupported' | 'notDetermined' | 'denied' | 'approved';

export const ScreenTime = {
  /** False until the native module is wired up. */
  isAvailable: false,

  async getAuthorizationStatus(): Promise<ScreenTimeStatus> {
    return 'unsupported';
  },

  async requestAuthorization(): Promise<ScreenTimeStatus> {
    return 'unsupported';
  },

  /** Lift the shield for `minutes` (re-applied automatically when time runs out). */
  async grantExtension(requestId: string, minutes: number): Promise<void> {
    console.log(`[ScreenTime stub] would unlock apps for ${minutes} min (request ${requestId})`);
  },
};
