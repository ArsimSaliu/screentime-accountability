import {
  badgesFor,
  describeLimit,
  describePendingChange,
  formatClock,
  displayName,
  formatStreak,
  summarizeWeek,
  type UserStats,
  formatMinutes,
  relativeTime,
  STRICTNESS_INFO,
  type Limit,
  type RequestWithDetails,
} from '@screentime/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../components/theme';
import { Body, Button, Card, ErrorText, Screen, SectionTitle, StatusPill } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useRealtime } from '../../hooks/useRealtime';
import { countAcceptedPartners, getStats, listMyLimits, listMyRequests } from '../../lib/api';
import { useAuth, useUserId } from '../../lib/auth';
import { updateWidget, widgetStateFrom } from '../../lib/widget';
import { ScreenTime, type ScreenTimeStatus } from '../../screentime';

export default function Home() {
  const userId = useUserId();
  const { profile } = useAuth();
  const { data, error, reload } = useAsync(async () => {
    const [limits, requests, partnerCount, stats] = await Promise.all([
      listMyLimits(userId),
      listMyRequests(userId, 5),
      countAcceptedPartners(userId),
      getStats(userId).catch(() => null),
    ]);
    return { limits, requests, partnerCount, stats };
  }, [userId]);

  useRealtime('extension_requests', reload, `requester_id=eq.${userId}`);

  const active = data?.requests.find((r) => r.status === 'pending');
  const [stStatus, setStStatus] = useState<ScreenTimeStatus>(() => ScreenTime.getAuthorizationStatus());

  // Keep the home-screen widget current.
  useEffect(() => {
    if (data) updateWidget(widgetStateFrom(data.stats, data.requests, data.limits));
  }, [data]);

  // Keep the device's monitors/shields in sync with the limits stored on the server.
  useEffect(() => {
    if (data && stStatus === 'approved') {
      ScreenTime.syncLimits(data.limits).catch((e) => console.warn('syncLimits failed', e));
    }
  }, [data, stStatus]);

  return (
    <Screen onRefresh={reload}>
      <Body muted>Hi {displayName(profile)} 👋</Body>
      <ErrorText error={error} />
      {data?.stats && <StatsCard stats={data.stats} />}

      {data && (
        <GettingStarted
          hasPartner={data.partnerCount > 0}
          hasLimit={data.limits.length > 0}
          screenTime={stStatus}
          hasApps={data.limits.some((l) => !!ScreenTime.getSelection(l.id))}
        />
      )}

      <ScreenTimeCard status={stStatus} onConnect={async () => setStStatus(await ScreenTime.requestAuthorization())} />

      {active ? (
        <ActiveRequestCard request={active} />
      ) : (
        <Button
          title="Limit reached? Request more time"
          onPress={() => router.push('/request/new')}
          disabled={!data || data.partnerCount === 0}
        />
      )}
      {data && data.partnerCount === 0 && (
        <Body muted>
          Add at least one accountability partner in the Partners tab before you can request extra time.
        </Body>
      )}

      <SectionTitle>Your limits</SectionTitle>
      {data?.limits.length === 0 && <Body muted>No limits yet.</Body>}
      {data?.limits.map((l) => <LimitRow key={l.id} limit={l} />)}
      <Button title="+ Add limit" variant="secondary" onPress={() => router.push('/limit/edit')} />

      {!!data?.requests.length && (
        <>
          <SectionTitle>Recent requests</SectionTitle>
          {data.requests.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </>
      )}
    </Screen>
  );
}

function StatsCard({ stats }: { stats: UserStats }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Body muted>Streak without extra time</Body>
        <Body muted>best {stats.best_streak_days} d</Body>
      </View>
      <Body style={{ fontSize: 28, fontWeight: '800', color: t.primary }}>{formatStreak(stats.streak_days)}</Body>
      <Body muted>This week: {summarizeWeek(stats)}</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {badgesFor(stats).map((b) => (
          <View
            key={b.id}
            accessibilityLabel={`${b.label}${b.earned ? '' : ' (not earned yet)'}`}
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: t.border,
              paddingHorizontal: 10,
              paddingVertical: 4,
              opacity: b.earned ? 1 : 0.35,
            }}
          >
            <Body style={{ fontSize: 13 }}>
              {b.emoji} {b.label}
            </Body>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** First-run checklist; disappears once everything is set up. */
function GettingStarted({
  hasPartner,
  hasLimit,
  hasApps,
  screenTime,
}: {
  hasPartner: boolean;
  hasLimit: boolean;
  hasApps: boolean;
  screenTime: ScreenTimeStatus;
}) {
  const t = useTheme();
  const steps = [
    { done: hasPartner, label: 'Add an accountability partner', go: () => router.push('/partners') },
    ...(screenTime === 'unsupported'
      ? []
      : [{ done: screenTime === 'approved', label: 'Allow Screen Time access', go: undefined }]),
    { done: hasLimit, label: 'Create your first limit', go: () => router.push('/limit/edit') },
    ...(screenTime === 'unsupported'
      ? []
      : [{ done: hasApps, label: 'Choose which apps it blocks', go: () => router.push('/limit/edit') }]),
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  return (
    <Card>
      <Body style={{ fontWeight: '800' }}>
        Get started · {doneCount}/{steps.length}
      </Body>
      {steps.map((s) => (
        <Pressable key={s.label} disabled={s.done || !s.go} onPress={s.go}>
          <Body style={{ color: s.done ? t.muted : t.text, textDecorationLine: s.done ? 'line-through' : 'none' }}>
            {s.done ? '✅' : '⬜️'} {s.label}
            {!s.done && s.go ? ' ›' : ''}
          </Body>
        </Pressable>
      ))}
    </Card>
  );
}

function ScreenTimeCard({ status, onConnect }: { status: ScreenTimeStatus; onConnect: () => void }) {
  if (status === 'approved') return null;
  if (status === 'unsupported') {
    return (
      <Card>
        <Body style={{ fontWeight: '700' }}>App blocking unavailable here</Body>
        <Body muted>
          Blocking needs the development build on an iPhone. You can still set limits, add partners and test
          requests.
        </Body>
      </Card>
    );
  }
  return (
    <Card>
      <Body style={{ fontWeight: '700' }}>Connect Screen Time</Body>
      <Body muted>
        {status === 'denied'
          ? 'Screen Time access was denied. Allow it so your limits can block apps.'
          : 'Allow Screen Time access so your limits can block apps. Only you can see which apps you pick.'}
      </Body>
      <Button title="Allow Screen Time access" onPress={onConnect} />
    </Card>
  );
}

function LimitRow({ limit }: { limit: Limit }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => router.push({ pathname: '/limit/edit', params: { id: limit.id } })}>
      <Card style={{ opacity: limit.active ? 1 : 0.5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Body style={{ fontWeight: '700' }}>{limit.name}</Body>
          <Body style={{ color: t.primary, fontWeight: '700' }}>
            {limit.kind === 'downtime' && limit.start_minute != null && limit.end_minute != null
              ? `🌙 ${formatClock(limit.start_minute)}–${formatClock(limit.end_minute)}`
              : formatMinutes(limit.minutes)}
          </Body>
        </View>
        <Body muted>
          {describeLimit(limit)} · {STRICTNESS_INFO[limit.strictness].label}
          {limit.active ? '' : ' · paused'}
        </Body>
        {ScreenTime.isAvailable && <Body muted>{ScreenTime.describeSelection(ScreenTime.getSelection(limit.id))}</Body>}
        {limit.pending_effective_at && (
          <Body style={{ color: t.warning }}>
            Scheduled: {describePendingChange(limit)} ({relativeTime(limit.pending_effective_at)})
          </Body>
        )}
      </Card>
    </Pressable>
  );
}

function ActiveRequestCard({ request }: { request: RequestWithDetails }) {
  const approvals = request.votes.filter((v) => v.decision === 'approve').length;
  return (
    <Pressable onPress={() => router.push({ pathname: '/request/[id]', params: { id: request.id } })}>
      <Card>
        <StatusPill status={request.status} />
        <Body style={{ fontWeight: '700' }}>
          {formatMinutes(request.minutes_requested)} requested{request.limit ? ` for ${request.limit.name}` : ''}
        </Body>
        <Body muted>
          {approvals}/{request.approvals_required} approvals · expires {relativeTime(request.expires_at)}
        </Body>
      </Card>
    </Pressable>
  );
}

function RequestRow({ request }: { request: RequestWithDetails }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/request/[id]', params: { id: request.id } })}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Body>{formatMinutes(request.minutes_requested)}</Body>
          <StatusPill status={request.status} />
        </View>
        <Body muted>{relativeTime(request.created_at)}</Body>
      </Card>
    </Pressable>
  );
}
