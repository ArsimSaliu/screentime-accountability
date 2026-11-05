import { displayName } from '@screentime/shared';
import { LiveRefresh } from '@/components/live-refresh';
import { Button, Card, SectionTitle } from '@/components/ui';
import { acceptInviteAction, removePartnershipAction } from '@/lib/actions';
import { getPartnerships } from '@/lib/data';
import { InviteForm } from './invite-form';

export default async function PartnersPage() {
  const { userId, partnerships } = await getPartnerships();
  const mine = partnerships.filter((p) => p.owner_id === userId);
  const incoming = partnerships.filter((p) => p.partner_id === userId && p.status === 'pending');
  const supporting = partnerships.filter((p) => p.partner_id === userId && p.status === 'accepted');

  return (
    <main>
      <LiveRefresh tables={['partnerships']} />
      <h1 className="text-3xl font-extrabold">Partners</h1>

      {incoming.length > 0 && (
        <>
          <SectionTitle>Invites for you</SectionTitle>
          <div className="grid gap-3">
            {incoming.map((p) => (
              <Card key={p.id} className="flex items-center justify-between gap-3">
                <span>
                  <b>{displayName(p.owner)}</b> wants you to approve their screen time extensions.
                </span>
                <div className="flex gap-2">
                  <form action={acceptInviteAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button variant="success">Accept</Button>
                  </form>
                  <form action={removePartnershipAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button variant="secondary">Decline</Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Your accountability partners</SectionTitle>
      <p className="mb-3 text-slate-500">These people approve or deny your requests for more time.</p>
      <div className="grid gap-3">
        {mine.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <p className="font-bold">{displayName(p.partner)}</p>
              <p className="text-sm text-slate-500">{p.status === 'pending' ? 'Invite pending' : `@${p.partner?.username}`}</p>
            </div>
            <form action={removePartnershipAction}>
              <input type="hidden" name="id" value={p.id} />
              <Button variant="secondary">Remove</Button>
            </form>
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <InviteForm />
      </div>

      {supporting.length > 0 && (
        <>
          <SectionTitle>You&apos;re a partner for</SectionTitle>
          <div className="grid gap-3">
            {supporting.map((p) => (
              <Card key={p.id} className="flex items-center justify-between">
                <span className="font-bold">{displayName(p.owner)}</span>
                <form action={removePartnershipAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button variant="secondary">Leave</Button>
                </form>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
