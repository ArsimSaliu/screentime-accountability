'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { createInviteLinkAction } from '@/lib/actions';

/** Create a shareable /join/<code> link and copy it. */
export function InviteLink() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await createInviteLinkAction();
    setBusy(false);
    if (res.error || !res.code) return setError(res.error ?? 'Something went wrong');
    setUrl(`${window.location.origin}/join/${res.code}`);
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <p className="font-semibold">📨 Invite with a link</p>
      <p className="mt-1 text-sm text-slate-500">
        Send it to a friend. They sign in and become your partner in one tap. Links last 7 days.
      </p>
      {url ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input readOnly value={url} className="h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700" />
          <Button onClick={copy} className="shrink-0">
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      ) : (
        <Button onClick={create} disabled={busy} className="mt-3">
          {busy ? 'Creating…' : 'Create invite link'}
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
