import {
  describePendingChange,
  displayName,
  formatMinutes,
  formatStreak,
  relativeTime,
  type RequestWithDetails,
} from '@screentime/shared';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../components/theme';
import { Body, Card, ErrorText, Screen, SectionTitle, StatusPill } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useRealtime } from '../../hooks/useRealtime';
import { listFriendAlerts, listPartnerRequests, type FriendAlert, type FriendStatus } from '../../lib/api';
import { useUserId } from '../../lib/auth';

export default function Inbox() {
  const userId = useUserId();
  const { data, error, reload } = useAsync(() => listPartnerRequests(userId), [userId]);
  const friends = useAsync(() => listFriendAlerts(userId), [userId]);

  // RLS limits realtime events to requests we're allowed to see.
  useRealtime('extension_requests', reload);
  useRealtime('request_votes', reload);

  const now = Date.now();
  const needsVote = (r: RequestWithDetails) =>
    r.status === 'pending' && new Date(r.expires_at).getTime() > now && !r.votes.some((v) => v.voter_id === userId);
  const todo = data?.filter(needsVote) ?? [];
  const rest = data?.filter((r) => !needsVote(r)) ?? [];

  return (
    <Screen
      onRefresh={() => {
        void reload();
        void friends.reload();
      }}
    >
      <ErrorText error={error ?? friends.error} />
      <SectionTitle>Needs your answer</SectionTitle>
      {todo.length === 0 && <Body muted>Nothing to approve right now.</Body>}
      {todo.map((r) => (
        <InboxRow key={r.id} request={r} highlight />
      ))}

      {!!friends.data?.alerts.length && (
        <>
          <SectionTitle>Alerts</SectionTitle>
          {friends.data.alerts.map((a, i) => (
            <AlertRow key={i} alert={a} />
          ))}
        </>
      )}

      {!!friends.data?.friends.length && (
        <>
          <SectionTitle>People you support</SectionTitle>
          {friends.data.friends.map((f) => (
            <FriendRow key={f.id} friend={f} />
          ))}
        </>
      )}

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

function AlertRow({ alert }: { alert: FriendAlert }) {
  const t = useTheme();
  if (alert.type === 'loosening') {
    return (
      <Card>
        <Body style={{ fontWeight: '700' }}>
          {displayName(alert.friend)} is loosening “{alert.limitName}”
        </Body>
        <Body muted>
          {describePendingChange(alert.limit)} · takes effect {relativeTime(alert.effectiveAt)}
        </Body>
      </Card>
    );
  }
  const revoked = alert.kind === 'screen_time_revoked';
  return (
    <Card>
      <Body style={{ fontWeight: '700', color: revoked ? t.danger : t.success }}>
        {revoked ? '⚠️' : '✓'} {displayName(alert.friend)} {revoked ? 'turned off app blocking' : 'turned app blocking back on'}
      </Body>
      <Body muted>{relativeTime(alert.at)}</Body>
    </Card>
  );
}

function FriendRow({ friend }: { friend: FriendStatus }) {
  const t = useTheme();
  const blocking = friend.screen_time_status === 'approved';
  return (
    <Card>
      <Body style={{ fontWeight: '700' }}>
        {displayName(friend)}
        {friend.streak_days !== undefined ? ` · ${formatStreak(friend.streak_days)}` : ''}
      </Body>
      <Body muted>
        {friend.last_seen_at ? `Last seen ${relativeTime(friend.last_seen_at)}` : 'Not seen yet'}
        {' · '}
        <Body style={{ color: blocking ? t.success : t.warning }}>
          {blocking ? 'blocking on' : friend.screen_time_status ? 'blocking off' : 'blocking not set up'}
        </Body>
      </Body>
    </Card>
  );
}
