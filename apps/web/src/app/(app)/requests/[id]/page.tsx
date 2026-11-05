import { displayName, formatMinutes, relativeTime } from '@screentime/shared';
import { notFound } from 'next/navigation';
import { LiveRefresh } from '@/components/live-refresh';
import { Button, Card, SectionTitle, StatusPill } from '@/components/ui';
import { cancelRequestAction } from '@/lib/actions';
import { getRequestDetails } from '@/lib/data';
import { VotePanel } from './vote-panel';

export default async function RequestPage({ params }: PageProps<'/requests/[id]'>) {
  const { id } = await params;
  const { now, userId, request } = await getRequestDetails(id);
  if (!request) notFound();

  const isMine = request.requester_id === userId;
  const myVote = request.votes.find((v) => v.voter_id === userId);
  const canVote =
    !isMine && request.status === 'pending' && !myVote && new Date(request.expires_at).getTime() > now;
  const approvals = request.votes.filter((v) => v.decision === 'approve').length;

  return (
    <main className="flex flex-col gap-4">
      <LiveRefresh
        tables={['extension_requests', 'request_votes']}
        filter={{ extension_requests: `id=eq.${id}`, request_votes: `request_id=eq.${id}` }}
      />
      <p className="text-slate-500">
        {isMine ? 'Your request' : `${displayName(request.requester)} is asking for more screen time`}
      </p>

      <Card>
        <StatusPill status={request.status} />
        {request.emergency && <p className="mt-2 font-semibold text-red-600">🚨 Emergency unlock (no approval needed)</p>}
        <p className="mt-3 text-4xl font-extrabold">{formatMinutes(request.minutes_requested)}</p>
        {request.limit && <p className="text-slate-500">Limit: {request.limit.name}</p>}
        <p className="mt-3 text-lg">{request.reason ? `“${request.reason}”` : <span className="text-slate-500">No reason given</span>}</p>
        <p className="mt-3 text-sm text-slate-500">
          Asked {relativeTime(request.created_at, now)}
          {request.status === 'pending' && ` · expires ${relativeTime(request.expires_at, now)}`}
        </p>
      </Card>

      {canVote && <VotePanel requestId={request.id} />}
      {myVote && <p className="text-slate-500">You {myVote.decision === 'approve' ? 'approved' : 'denied'} this request.</p>}

      {isMine && request.status === 'pending' && (
        <form action={cancelRequestAction}>
          <input type="hidden" name="requestId" value={request.id} />
          <Button variant="secondary">Cancel request</Button>
        </form>
      )}

      <SectionTitle>
        Votes · {approvals}/{request.approvals_required} approvals needed
      </SectionTitle>
      {request.votes.length === 0 && <p className="text-slate-500">No responses yet.</p>}
      {request.votes.map((v) => (
        <Card key={v.voter_id}>
          <span className={v.decision === 'approve' ? 'font-bold text-green-600' : 'font-bold text-red-600'}>
            {v.decision === 'approve' ? '✓ Approved' : '✕ Denied'}
          </span>{' '}
          by {displayName(v.voter)}
          {v.comment && <p className="mt-1 text-slate-500">“{v.comment}”</p>}
        </Card>
      ))}
    </main>
  );
}
