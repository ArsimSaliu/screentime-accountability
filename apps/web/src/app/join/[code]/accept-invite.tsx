'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui';
import { acceptInviteLinkAction } from '@/lib/actions';

export function AcceptInvite({ code }: { code: string }) {
  const [state, action, pending] = useActionState(acceptInviteLinkAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <Button variant="success" disabled={pending}>
        {pending ? 'Accepting…' : 'Accept'}
      </Button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
