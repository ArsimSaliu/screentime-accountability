import { displayName, formatMinutes, relativeTime, type RequestWithDetails } from '@screentime/shared';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Body, Card, ErrorText, Screen, SectionTitle, StatusPill } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useRealtime } from '../../hooks/useRealtime';
import { listPartnerRequests } from '../../lib/api';
import { useUserId } from '../../lib/auth';

export default function Inbox() {
  const userId = useUserId();
  const { data, error, reload } = useAsync(() => listPartnerRequests(userId), [userId]);

  // RLS limits realtime events to requests we're allowed to see.
  useRealtime('extension_requests', reload);
  useRealtime('request_votes', reload);

  const now = Date.now();
  const needsVote = (r: RequestWithDetails) =>
    r.status === 'pending' && new Date(r.expires_at).getTime() > now && !r.votes.some((v) => v.voter_id === userId);
  const todo = data?.filter(needsVote) ?? [];
  const rest = data?.filter((r) => !needsVote(r)) ?? [];

  return (
    <Screen onRefresh={reload}>
      <ErrorText error={error} />
      <SectionTitle>Needs your answer</SectionTitle>
      {todo.length === 0 && <Body muted>Nothing to approve right now.</Body>}
      {todo.map((r) => (
        <InboxRow key={r.id} request={r} highlight />
      ))}

      {rest.length > 0 && <SectionTitle>History</SectionTitle>}
      {rest.map((r) => (
        <InboxRow key={r.id} request={r} />
      ))}
    </Screen>
  );
}

function InboxRow({ request, highlight }: { request: RequestWithDetails; highlight?: boolean }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/request/[id]', params: { id: request.id } })}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Body style={{ fontWeight: highlight ? '800' : '600' }}>
            {displayName(request.requester)} · {formatMinutes(request.minutes_requested)}
          </Body>
          <StatusPill status={request.status} />
        </View>
        {request.reason ? <Body>“{request.reason}”</Body> : null}
        <Body muted>{relativeTime(request.created_at)}</Body>
      </Card>
    </Pressable>
  );
}
