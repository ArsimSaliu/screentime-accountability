import {
  NOTIFICATION_ACTION_APPROVE,
  NOTIFICATION_ACTION_DENY,
  TIME_REQUEST_CATEGORY,
} from '@screentime/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

let currentToken: string | null = null;

/** Call once at startup (outside React). */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Approve / Deny buttons on "X wants more time" notifications.
  // opensAppToForeground: true so our JS reliably runs and can record the vote.
  void Notifications.setNotificationCategoryAsync(TIME_REQUEST_CATEGORY, [
    {
      identifier: NOTIFICATION_ACTION_APPROVE,
      buttonTitle: 'Approve',
      options: { opensAppToForeground: true },
    },
    {
      identifier: NOTIFICATION_ACTION_DENY,
      buttonTitle: 'Deny',
      options: { opensAppToForeground: true, isDestructive: true },
    },
  ]);
}

/** Ask permission, fetch the Expo push token and store it for the signed-in user. */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications need a physical device');
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('No EAS projectId found. Run `eas init` in apps/mobile.');
    return null;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: 'ios' });
  if (error) {
    console.warn('register_push_token failed', error.message);
    return null;
  }
  currentToken = token;
  return token;
}

/** Remove this device's token so a signed-out phone stops getting pushes. */
export async function unregisterPushToken() {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}
