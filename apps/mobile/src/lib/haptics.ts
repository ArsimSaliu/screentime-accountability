import * as Haptics from 'expo-haptics';

/** Fire-and-forget haptics; never throw (e.g. simulator, web). */
export const haptic = {
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  tap: () => void Haptics.selectionAsync().catch(() => {}),
};
