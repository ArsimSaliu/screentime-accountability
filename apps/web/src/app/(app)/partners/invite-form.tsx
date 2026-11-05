'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button, Input } from '@/components/ui';
import { invitePartnerAction } from '@/lib/actions';

export function InviteForm() {
  const [state, action, pending] = useActionState(invitePartnerAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2 sm:flex-row">
      <Input name="username" placeholder="Invite by username" autoCapitalize="none" required />
      <Button disabled={pending} className="shrink-0">
        {pending ? 'Sending…' : 'Send invite'}
      </Button>
      {state?.error && <p className="text-sm text-red-600 sm:self-center">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-600 sm:self-center">Invite sent!</p>}
    </form>
  );
}
