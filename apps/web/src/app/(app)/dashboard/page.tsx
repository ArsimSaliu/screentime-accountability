import {
  describePendingChange,
  displayName,
  formatStreak,
  summarizeWeek,
  formatMinutes,
  relativeTime,
  STRICTNESS_INFO,
  type RequestWithDetails,
} from '@screentime/shared';
import Link from 'next/link';
import { LiveRefresh } from '@/components/live-refresh';
import { Button, Card, SectionTitle, StatusPill } from '@/components/ui';
import { cancelPendingLimitChangeAction } from '@/lib/actions';
import { getDashboard } from '@/lib/data';

export default async function Dashboard() {
  const {
    now,
    userId,
    profile,
    limits,
    myRequests,
    partnerRequests,
    partnerCount,
    friendLoosening,
    friendTamper,
    friends,
    stats,
  } = await getDashboard();
  const needsVote = partnerRequests.filter(
    (r) => r.status === 'pending' && new Date(r.expires_at).getTime() > now && !r.votes.some((v) => v.voter_id === userId),
  );
  const activeMine = myRequests.find((r) => r.status === 'pending');

  return (
    <main>
      <LiveRefresh tables={['extension_requests', 'request_votes', 'limits', 'tamper_events']} />
      <h1 className="text-3xl font-extrabold">Hi {displayName(profile)}</h1>

      {stats && (
        <Card className="mt-6">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Streak without extra time</span>
            <span className="text-sm text-slate-500">best {stats.best_streak_days} d</span>
          </div>
          <p className="mt-1 text-4xl font-extrabold text-indigo-600">{formatStreak(stats.streak_days)}</p>
          <p className="mt-1 text-sm text-slate-500">This week: {summarizeWeek(stats)}</p>
          {stats.partner.votes > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              As a partner: {stats.partner.votes} answers in 30 days
              {stats.partner.avg_response_minutes !== null &&
                `, usually within ${Math.max(1, Math.round(stats.partner.avg_response_minutes))} min`}
            </p>
          )}
        </Card>
      )}

      <SectionTitle>Needs your answer</SectionTitle>
      {needsVote.length === 0 ? (
        <p className="text-slate-500">Nothing to approve right now.</p>
      ) : (
        <div className="grid gap-3">
          {needsVote.map((r) => (
            <RequestLink key={r.id} request={r} now={now} showRequester highlight />
          ))}
        </div>
      )}

      {(friendLoosening.length > 0 || friendTamper.length > 0) && (
        <>
          <SectionTitle>Alerts</SectionTitle>
          <div className="grid gap-3">
            {friendTamper.map((e) => (
              <Card key={e.id} className={e.kind === 'screen_time_revoked' ? 'border-red-400 dark:border-red-500' : ''}>
                <p className="font-semibold">
                  {e.kind === 'screen_time_revoked' ? '⚠️ ' : '✓ '}
                  {displayName(e.owner)}{' '}
                  {e.kind === 'screen_time_revoked' ? 'turned off app blocking' : 'turned app blocking back on'}
                </p>
                <p className="text-sm text-slate-500">{relativeTime(e.created_at, now)}</p>
              </Card>
            ))}
            {friendLoosening.map((l) => (
              <Card key={l.id} className="border-amber-400 dark:border-amber-500">
                <p className="font-semibold">
                  {displayName(l.owner)} is loosening “{l.name}”
                </p>
                <p className="text-sm text-slate-500">
                  {describePendingChange(l)} · takes effect {relativeTime(l.pending_effective_at!, now)}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      {friends.length > 0 && (
        <>
          <SectionTitle>People you support</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {friends.map((f) => (
              <Card key={f.id}>
                <p className="font-semibold">
                  {displayName(f)}
                  {f.streak_days !== null && <span className="font-normal text-slate-500"> · {formatStreak(f.streak_days)}</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {f.last_seen_at ? `Last seen ${relativeTime(f.last_seen_at, now)}` : 'Not seen yet'} ·{' '}
                  <span className={f.screen_time_status === 'approved' ? 'text-green-600' : 'text-amber-600'}>
                    {f.screen_time_status === 'approved'
                      ? 'blocking on'
                      : f.screen_time_status
                        ? 'blocking off'
                        : 'blocking not set up'}
                  </span>
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      {activeMine && (
        <>
          <SectionTitle>Your active request</SectionTitle>
          <RequestLink request={activeMine} now={now} />
        </>
      )}

      <SectionTitle>Your limits</SectionTitle>
      {limits.length === 0 ? (
        <p className="text-slate-500">No limits yet. Create them in the iOS app.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {limits.map((l) => (
            <Card key={l.id} className={l.active ? '' : 'opacity-50'}>
              <div className="flex justify-between">
                <span className="font-bold">{l.name}</span>
                <span className="font-bold text-indigo-600">{formatMinutes(l.minutes)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {l.kind === 'daily' ? 'Per day' : 'Per session'} · {STRICTNESS_INFO[l.strictness].label}
                {l.active ? '' : ' · paused'}
              </p>
              {l.pending_effective_at && (
                <div className="mt-2 flex items-center justify-between gap-2 text-sm text-amber-600">
                  <span>
                    Scheduled: {describePendingChange(l)} ({relativeTime(l.pending_effective_at, now)})
                  </span>
                  <form action={cancelPendingLimitChangeAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <Button variant="secondary" className="h-8 px-3 text-xs">
                      Cancel
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {partnerCount === 0 && (
        <p className="mt-4 text-sm text-amber-600">
          You don&apos;t have any accountability partners yet. <Link href="/partners" className="underline">Invite one</Link>.
        </p>
      )}

      <SectionTitle>Your recent requests</SectionTitle>
      {myRequests.length === 0 ? (
        <p className="text-slate-500">None yet.</p>
      ) : (
        <div className="grid gap-3">
          {myRequests.map((r) => (
            <RequestLink key={r.id} request={r} now={now} />
          ))}
        </div>
      )}

      {partnerRequests.length > needsVote.length && (
        <>
          <SectionTitle>Friends&apos; request history</SectionTitle>
          <div className="grid gap-3">
            {partnerRequests
              .filter((r) => !needsVote.includes(r))
              .map((r) => (
                <RequestLink key={r.id} request={r} now={now} showRequester />
              ))}
          </div>
        </>
      )}
    </main>
  );
}

function RequestLink({
  request,
  now,
  showRequester,
  highlight,
}: {
  request: RequestWithDetails;
  now: number;
  showRequester?: boolean;
  highlight?: boolean;
}) {
  return (
    <Link href={`/requests/${request.id}`}>
      <Card className={`transition hover:border-indigo-400 ${highlight ? 'border-amber-400 dark:border-amber-500' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">
            {request.emergency ? '🚨 ' : ''}
            {showRequester ? `${displayName(request.requester)} · ` : ''}
            {formatMinutes(request.minutes_requested)}
            {request.limit ? ` for ${request.limit.name}` : ''}
          </span>
          <StatusPill status={request.status} />
        </div>
        {request.reason && <p className="mt-1">“{request.reason}”</p>}
        <p className="mt-1 text-sm text-slate-500">{relativeTime(request.created_at, now)}</p>
      </Card>
    </Link>
  );
}
