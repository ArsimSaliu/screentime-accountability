import AsyncStorage from '@react-native-async-storage/async-storage';
import { displayName, formatMinutes, relativeTime, type RequestWithDetails, type VoteDecision } from '@screentime/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useTheme } from '../../components/theme';
import { Body, Button, Card, ErrorText, Field, Loading, Screen, SectionTitle, StatusPill } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useRealtime } from '../../hooks/useRealtime';
import { cancelRequest, castVote, getRequest } from '../../lib/api';
import { useUserId } from '../../lib/auth';
import { friendlyError } from '../../lib/supabase';
import { ScreenTime } from '../../screentime';

export default function RequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const { data: request, error, loading, reload } = useAsync(() => getRequest(id), [id]);

  useRealtime('extension_requests', reload, `id=eq.${id}`);
  useRealtime('request_votes', reload, `request_id=eq.${id}`);

  if (loading) return <Loading />;
  if (!request) {
    return (
      <Screen>
        <ErrorText error={error ?? 'Request not found'} />
      </Screen>
    );
  }

  const isMine = request.requester_id === userId;
  return (
    <>
      <Stack.Screen options={{ title: isMine ? 'Your request' : displayName(request.requester) }} />
      {isMine ? <RequesterView request={request} /> : <PartnerView request={request} onVoted={reload} />}
    </>
  );
}

function Summary({ request }: { request: RequestWithDetails }) {
  return (
    <Card>
      <StatusPill status={request.status} />
      {request.emergency && <Body style={{ fontWeight: '700' }}>🚨 Emergency unlock (no approval needed)</Body>}
      <Body style={{ fontSize: 22, fontWeight: '800' }}>{formatMinutes(request.minutes_requested)}</Body>
      {request.limit && <Body muted>Limit: {request.limit.name}</Body>}
      {request.reason ? <Body>“{request.reason}”</Body> : <Body muted>No reason given</Body>}
      <Body muted>
        Asked {relativeTime(request.created_at)}
        {request.status === 'pending' ? ` · expires ${relativeTime(request.expires_at)}` : ''}
      </Body>
    </Card>
  );
}

function Votes({ request }: { request: RequestWithDetails }) {
  const t = useTheme();
  const approvals = request.votes.filter((v) => v.decision === 'approve').length;
  return (
    <>
      <SectionTitle>
        Votes · {approvals}/{request.approvals_required} approvals needed
      </SectionTitle>
      {request.votes.length === 0 && <Body muted>No responses yet.</Body>}
      {request.votes.map((v) => (
        <Card key={v.voter_id}>
          <Body>
            <Body style={{ color: v.decision === 'approve' ? t.success : t.danger, fontWeight: '700' }}>
              {v.decision === 'approve' ? '✓ Approved' : '✕ Denied'}
            </Body>{' '}
            by {displayName(v.voter)}
          </Body>
          {v.comment ? <Body muted>“{v.comment}”</Body> : null}
        </Card>
      ))}
    </>
  );
}

function RequesterView({ request }: { request: RequestWithDetails }) {
  const t = useTheme();
  const [cancelling, setCancelling] = useState(false);

  // When approved, unlock exactly once per request (Phase 3 makes this real).
  useEffect(() => {
    if (request.status !== 'approved' || !request.minutes_granted) return;
    const key = `granted:${request.id}`;
    void AsyncStorage.getItem(key).then(async (done) => {
      if (done) return;
      await ScreenTime.grantExtension(request.id, request.minutes_granted!, request.limit_id);
      await AsyncStorage.setItem(key, new Date().toISOString());
    });
  }, [request.id, request.status, request.minutes_granted, request.limit_id]);

  async function cancel() {
    setCancelling(true);
    try {
      await cancelRequest(request.id);
    } catch (e) {
      Alert.alert('Could not cancel', friendlyError(e));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Screen>
      <Summary request={request} />
      {request.status === 'pending' && (
        <Body muted style={{ textAlign: 'center' }}>
          Waiting for your partners… this screen updates live.
        </Body>
      )}
      {request.status === 'approved' && (
        <Card style={{ borderColor: t.success }}>
          <Body style={{ fontWeight: '800', color: t.success }}>
            Unlocked for {formatMinutes(request.minutes_granted ?? request.minutes_requested)} 🎉
          </Body>
          <Body muted>Your apps will be blocked again when the time is up.</Body>
        </Card>
      )}
      <Votes request={request} />
      {request.status === 'pending' && (
        <Button title="Cancel request" variant="secondary" onPress={cancel} loading={cancelling} />
      )}
    </Screen>
  );
}

function PartnerView({ request, onVoted }: { request: RequestWithDetails; onVoted: () => void }) {
  const userId = useUserId();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<VoteDecision | null>(null);
  const myVote = request.votes.find((v) => v.voter_id === userId);
  const canVote = request.status === 'pending' && !myVote && new Date(request.expires_at) > new Date();

  async function vote(decision: VoteDecision) {
    setBusy(decision);
    try {
      await castVote(request.id, userId, decision, comment.trim());
      onVoted();
    } catch (e) {
      Alert.alert('Could not record your vote', friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Body muted>{displayName(request.requester)} is asking for more screen time.</Body>
      <Summary request={request} />
      {canVote && (
        <>
          <Field
            label="Message (optional)"
            value={comment}
            onChangeText={setComment}
            placeholder="e.g. OK, but then bed!"
            maxLength={280}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              style={{ flex: 1 }}
              title="Deny"
              variant="danger"
              onPress={() => vote('deny')}
              loading={busy === 'deny'}
              disabled={!!busy}
            />
            <Button
              style={{ flex: 1 }}
              title="Approve"
              variant="success"
              onPress={() => vote('approve')}
              loading={busy === 'approve'}
              disabled={!!busy}
            />
          </View>
        </>
      )}
      <Votes request={request} />
    </Screen>
  );
}
