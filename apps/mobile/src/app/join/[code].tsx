import { displayName, type InviteLinkInfo } from '@screentime/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Body, Button, Card, Loading, Screen } from '../../components/ui';
import { acceptInviteLink, getInviteLinkInfo } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import { friendlyError } from '../../lib/supabase';

/** Opened from an invite link (leash://join/<code>): become someone's accountability partner. */
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [info, setInfo] = useState<InviteLinkInfo | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void AsyncStorage.removeItem('pending_invite_code');
    getInviteLinkInfo(code).then(setInfo, (e) => setError(friendlyError(e)));
  }, [code]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await acceptInviteLink(code);
      haptic.success();
      router.replace('/partners');
    } catch (e) {
      haptic.error();
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  if (info === undefined && !error) return <Loading />;

  return (
    <Screen>
      {!info || info.expired ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>This invite link is invalid or has expired.</Body>
          <Body muted>Ask your friend to send you a new one.</Body>
        </Card>
      ) : (
        <Card>
          <Body style={{ fontSize: 22, fontWeight: '800' }}>{displayName(info)}</Body>
          <Body>
            wants you as an accountability partner. You&apos;ll be asked to approve or deny their requests for
            extra screen time.
          </Body>
          <Button title="Accept" variant="success" onPress={accept} loading={busy} />
        </Card>
      )}
      {error ? <Body style={{ color: 'red' }}>{error}</Body> : null}
      <Button title="Not now" variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}
