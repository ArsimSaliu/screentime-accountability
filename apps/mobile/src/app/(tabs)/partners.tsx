import { displayName, relativeTime, type PartnershipWithProfiles } from '@screentime/shared';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Screen, SectionTitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useRealtime } from '../../hooks/useRealtime';
import { acceptInvite, cancelPartnerRemoval, invitePartner, listPartnerships, removePartnership } from '../../lib/api';
import { useUserId } from '../../lib/auth';
import { friendlyError } from '../../lib/supabase';

export default function Partners() {
  const userId = useUserId();
  const { data, error, reload } = useAsync(listPartnerships, []);
  useRealtime('partnerships', reload);

  const [username, setUsername] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myPartners = data?.filter((p) => p.owner_id === userId) ?? [];
  const incoming = data?.filter((p) => p.partner_id === userId && p.status === 'pending') ?? [];
  const iSupport = data?.filter((p) => p.partner_id === userId && p.status === 'accepted') ?? [];

  async function invite() {
    if (!username.trim()) return;
    setBusy(true);
    setInviteError(null);
    try {
      await invitePartner(username.trim().replace(/^@/, ''));
      setUsername('');
      await reload();
    } catch (e) {
      setInviteError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(p: PartnershipWithProfiles, other: string) {
    const delayed = p.owner_id === userId && p.status === 'accepted';
    Alert.alert(
      'Remove partner?',
      delayed
        ? `${other} stays your partner for 24 more hours and will be told. You can cancel before then.`
        : `${other} will no longer be connected to you.`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removePartnership(p.id).then(reload, (e) => Alert.alert('Error', friendlyError(e))),
      },
    ],
    );
  }

  return (
    <Screen onRefresh={reload}>
      <ErrorText error={error} />

      {incoming.length > 0 && (
        <>
          <SectionTitle>Invites for you</SectionTitle>
          {incoming.map((p) => (
            <Card key={p.id}>
              <Body>
                <Body style={{ fontWeight: '700' }}>{displayName(p.owner)}</Body> wants you to approve their screen
                time extensions.
              </Body>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  style={{ flex: 1 }}
                  title="Accept"
                  variant="success"
                  onPress={() => acceptInvite(p.id).then(reload, (e) => Alert.alert('Error', friendlyError(e)))}
                />
                <Button
                  style={{ flex: 1 }}
                  title="Decline"
                  variant="secondary"
                  onPress={() => removePartnership(p.id).then(reload, (e) => Alert.alert('Error', friendlyError(e)))}
                />
              </View>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Your accountability partners</SectionTitle>
      <Body muted>These people approve or deny your requests for more time.</Body>
      {myPartners.map((p) => (
        <Card key={p.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Body style={{ fontWeight: '700' }}>{displayName(p.partner)}</Body>
              <Body muted>
                {p.status === 'pending'
                  ? 'Invite pending'
                  : p.removal_effective_at
                    ? `Removing ${relativeTime(p.removal_effective_at)}`
                    : `@${p.partner?.username}`}
              </Body>
            </View>
            {p.removal_effective_at ? (
              <Button
                title="Keep"
                variant="secondary"
                onPress={() => cancelPartnerRemoval(p.id).then(reload, (e) => Alert.alert('Error', friendlyError(e)))}
              />
            ) : (
              <Button title="Remove" variant="secondary" onPress={() => confirmRemove(p, displayName(p.partner))} />
            )}
          </View>
        </Card>
      ))}
      <Field
        label="Invite by username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="their_username"
        error={inviteError}
        onSubmitEditing={invite}
      />
      <Button title="Send invite" onPress={invite} loading={busy} disabled={!username.trim()} />

      {iSupport.length > 0 && (
        <>
          <SectionTitle>You're a partner for</SectionTitle>
          {iSupport.map((p) => (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Body style={{ fontWeight: '700' }}>{displayName(p.owner)}</Body>
                <Button title="Leave" variant="secondary" onPress={() => confirmRemove(p, displayName(p.owner))} />
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
