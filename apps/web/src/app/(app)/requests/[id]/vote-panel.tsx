'use client';

import { useActionState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { voteAction } from '@/lib/actions';

export function VotePanel({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(voteAction, undefined);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="requestId" value={requestId} />
        <Input name="comment" placeholder="Message (optional), e.g. OK, but then bed!" maxLength={280} />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Button name="decision" value="deny" variant="danger" disabled={pending}>
            Deny
          </Button>
          <Button name="decision" value="approve" variant="success" disabled={pending}>
            Approve
          </Button>
        </div>
      </form>
    </Card>
  );
}
