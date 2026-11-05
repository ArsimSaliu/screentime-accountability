import {
  NOTIFICATION_ACTION_APPROVE,
  NOTIFICATION_ACTION_DENY,
  type PushData,
} from '@screentime/shared';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTheme } from '../components/theme';
import { Loading } from '../components/ui';
import { castVote } from '../lib/api';
import { AuthProvider, useAuth } from '../lib/auth';
import { configureNotifications, registerForPushNotifications } from '../lib/notifications';
import { friendlyError } from '../lib/supabase';

configureNotifications();

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, profile, loading } = useAuth();
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

  useEffect(() => {
    if (!lastResponse) return;
    const key = `${lastResponse.notification.request.identifier}:${lastResponse.actionIdentifier}`;
    if (handled.current === key) return;
    handled.current = key;

    const data = lastResponse.notification.request.content.data as PushData | undefined;
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
    } else if (data.kind === 'invite_received' || data.kind === 'invite_accepted') {
      router.push('/partners');
    }
    Notifications.clearLastNotificationResponse();
  }, [lastResponse, userId]);

  return null;
}
