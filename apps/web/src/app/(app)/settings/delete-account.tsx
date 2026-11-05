'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export function DeleteAccount() {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      setBusy(false);
      return setError('Could not delete your account. Please try again.');
    }
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/');
    router.refresh();
  }

  return (
    <Card>
      <p>
        Permanently delete your account, limits, requests and partner connections. Your partners will be told.
        This can&apos;t be undone.
      </p>
      <p className="mt-3 text-sm text-slate-500">
        Type <b>DELETE</b> to confirm.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
        <Button variant="danger" disabled={confirm !== 'DELETE' || busy} onClick={remove} className="shrink-0">
          {busy ? 'Deleting…' : 'Delete account'}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
