import {
  NOTIFICATION_ACTION_APPROVE,
  NOTIFICATION_ACTION_DENY,
  type PushData,
} from '@screentime/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useTheme } from '../components/theme';
import { Loading } from '../components/ui';
import { castVote, reportScreenTimeStatus } from '../lib/api';
import { AuthProvider, useAuth } from '../lib/auth';
import { configureNotifications, registerForPushNotifications } from '../lib/notifications';
import { friendlyError } from '../lib/supabase';
import { ScreenTime, SHIELD_REQUEST_CATEGORY } from '../screentime';

configureNotifications();

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const PENDING_INVITE_KEY = 'pending_invite_code';
const JOIN_RE = /\/join\/([A-Za-z0-9_-]{6,64})/;

function RootNavigator() {
  const { session, profile, loading } = useAuth();

  // An invite link opened while signed out can't reach the join screen yet (it's behind the
  // sign-in guard), so remember the code and open it after sign-in / onboarding.
  const url = Linking.useLinkingURL();
  useEffect(() => {
    const code = url ? JOIN_RE.exec(url)?.[1] : undefined;
    if (code) void AsyncStorage.setItem(PENDING_INVITE_KEY, code);
  }, [url]);
  const t = useTheme();
  const signedIn = !!session;
  const ready = signedIn && !!profile?.onboarded;

  if (loading || (signedIn && !profile)) return <Loading />;

  return (
    <>
      <StatusBar style="auto" />
      {ready && <SignedInEffects userId={session.user.id} />}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !profile?.onboarded}>
          <Stack.Screen name="onboarding" options={{ title: 'Welcome', headerBackVisible: false }} />
        </Stack.Protected>

        <Stack.Protected guard={ready}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="limit/edit" options={{ presentation: 'modal', title: 'Limit' }} />
          <Stack.Screen name="request/new" options={{ presentation: 'modal', title: 'Request more time' }} />
          <Stack.Screen name="request/[id]" options={{ title: 'Request' }} />
          <Stack.Screen name="join/[code]" options={{ presentation: 'modal', title: 'Partner invite' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Push registration + handling taps / Approve / Deny on notifications. */
function SignedInEffects({ userId }: { userId: string }) {
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    void registerForPushNotifications();
  }, [userId]);

  // Resume an invite link that was opened before signing in.
  useEffect(() => {
    void AsyncStorage.getItem(PENDING_INVITE_KEY).then((code) => {
      if (!code) return;
      void AsyncStorage.removeItem(PENDING_INVITE_KEY);
      router.push({ pathname: '/join/[code]', params: { code } });
    });
  }, [userId]);

  // Heartbeat + tamper detection whenever the app comes to the foreground.
  useEffect(() => {
    const report = () => void reportScreenTimeStatus(ScreenTime.getAuthorizationStatus());
    report();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && report());
    return () => sub.remove();
  }, [userId]);

  useEffect(() => {
    if (!lastResponse) return;
    const key = `${lastResponse.notification.request.identifier}:${lastResponse.actionIdentifier}`;
    if (handled.current === key) return;
    handled.current = key;

    const content = lastResponse.notification.request.content;
    if (content.categoryIdentifier === SHIELD_REQUEST_CATEGORY) {
      // Sent by the ShieldAction extension when "Ask for more time" is tapped on a blocked app.
      router.push('/request/new');
      Notifications.clearLastNotificationResponse();
      return;
    }

    const data = content.data as PushData | undefined;
    if (!data?.kind) return;

    if (data.kind === 'request_created' || data.kind === 'request_resolved') {
      const { requestId } = data;
      const action = lastResponse.actionIdentifier;
      if (action === NOTIFICATION_ACTION_APPROVE || action === NOTIFICATION_ACTION_DENY) {
        castVote(requestId, userId, action === NOTIFICATION_ACTION_APPROVE ? 'approve' : 'deny')
          .catch((e) => Alert.alert('Could not record your vote', friendlyError(e)))
          .finally(() => router.push({ pathname: '/request/[id]', params: { id: requestId } }));
      } else {
        router.push({ pathname: '/request/[id]', params: { id: requestId } });
      }
    } else if (data.kind === 'invite_received' || data.kind === 'invite_accepted' || data.kind === 'partner_removal') {
      router.push('/partners');
    } else if (data.kind === 'limit_loosening' || data.kind === 'tamper') {
      router.push('/inbox');
    } else if (data.kind === 'account_deleted') {
      router.push('/partners');
    } else if (data.kind === 'weekly_digest') {
      router.push('/');
    }
    Notifications.clearLastNotificationResponse();
  }, [lastResponse, userId]);

  return null;
}
