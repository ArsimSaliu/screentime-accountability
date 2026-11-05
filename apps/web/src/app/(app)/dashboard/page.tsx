import {
  displayName,
  formatMinutes,
  relativeTime,
  STRICTNESS_INFO,
  type RequestWithDetails,
} from '@screentime/shared';
import Link from 'next/link';
import { LiveRefresh } from '@/components/live-refresh';
import { Card, SectionTitle, StatusPill } from '@/components/ui';
import { getDashboard } from '@/lib/data';

export default async function Dashboard() {
  const { now, userId, profile, limits, myRequests, partnerRequests, partnerCount } = await getDashboard();
  const needsVote = partnerRequests.filter(
    (r) => r.status === 'pending' && new Date(r.expires_at).getTime() > now && !r.votes.some((v) => v.voter_id === userId),
  );
  const activeMine = myRequests.find((r) => r.status === 'pending');

  return (
    <main>
      <LiveRefresh tables={['extension_requests', 'request_votes']} />
      <h1 className="text-3xl font-extrabold">Hi {displayName(profile)}</h1>

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
