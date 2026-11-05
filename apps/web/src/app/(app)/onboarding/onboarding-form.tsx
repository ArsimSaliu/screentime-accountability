'use client';

import { useActionState } from 'react';
import { Button, Input } from '@/components/ui';
import { onboardingAction } from '@/lib/actions';

export function OnboardingForm() {
  const [state, action, pending] = useActionState(onboardingAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Input name="username" placeholder="username" autoCapitalize="none" required />
      <Input name="display_name" placeholder="Display name (optional)" />
      <input type="hidden" name="timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button disabled={pending}>{pending ? 'Saving…' : 'Continue'}</Button>
    </form>
  );
}
