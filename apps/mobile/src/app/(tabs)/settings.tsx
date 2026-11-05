import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Body, Button, Card, Screen, SectionTitle } from '../../components/ui';
import { useAuth } from '../../lib/auth';

export default function Settings() {
  const { profile, session, signOut } = useAuth();
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;

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

      <Button title="Sign out" variant="danger" onPress={signOut} />

      <Body muted style={{ textAlign: 'center', marginTop: 24 }}>
        Version {Constants.expoConfig?.version ?? '?'}
      </Body>
    </Screen>
  );
}
