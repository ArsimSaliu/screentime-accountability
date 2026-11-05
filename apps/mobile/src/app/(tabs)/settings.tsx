import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { Body, Button, Card, Screen, SectionTitle } from '../../components/ui';
import { deleteAccount } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { friendlyError, supabase } from '../../lib/supabase';
import { ScreenTime } from '../../screentime';

export default function Settings() {
  const { profile, session, signOut } = useAuth();
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  const [deleting, setDeleting] = useState(false);

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your limits, requests and partner connections. Your partners will be told. App blocks set by Leash are removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              ScreenTime.reset();
              // The server already removed the user; just clear the local session.
              await supabase.auth.signOut({ scope: 'local' });
            } catch (e) {
              setDeleting(false);
              Alert.alert('Could not delete account', friendlyError(e));
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <SectionTitle>Account</SectionTitle>
      <Card>
        <Body style={{ fontWeight: '700' }}>{profile?.display_name || `@${profile?.username}`}</Body>
        <Body muted>@{profile?.username}</Body>
        <Body muted>{session?.user.email}</Body>
      </Card>

      {webUrl ? (
        <Button title="Open web dashboard" variant="secondary" onPress={() => Linking.openURL(webUrl)} />
      ) : null}

      {webUrl ? (
        <Button title="Privacy policy" variant="secondary" onPress={() => Linking.openURL(`${webUrl}/privacy`)} />
      ) : null}

      <Button title="Sign out" variant="secondary" onPress={signOut} />

      <SectionTitle>Danger zone</SectionTitle>
      <Button title="Delete account" variant="danger" onPress={confirmDelete} loading={deleting} />

      <Body muted style={{ textAlign: 'center', marginTop: 24 }}>
        Version {Constants.expoConfig?.version ?? '?'}
      </Body>
    </Screen>
  );
}
