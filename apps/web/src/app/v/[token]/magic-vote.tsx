'use client';

import { COUNTER_OFFER_OPTIONS, formatMinutes, relativeTime, type RequestStatus } from '@screentime/shared';
import { useEffect, useState } from 'react';
import { Button, Card, Input, StatusPill } from '@/components/ui';

type Preview = {
  requesterName: string;
  voterName: string;
  minutes: number;
  reason: string | null;
  limitName: string | null;
  status: RequestStatus;
  expiresAt: string;
  createdAt: string;
  alreadyUsed: boolean;
};

type Result = { request?: Preview; error?: string; ok?: boolean };

const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/magic-vote`;

async function call(body: Record<string, unknown>): Promise<Result> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Result;
  } catch {
    return { error: 'Network error. Try again.' };
  }
}

export function MagicVote({ token }: { token: string }) {
  const [data, setData] = useState<Result | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<number | null>(null);

  useEffect(() => {
    void call({ token }).then(setData);
  }, [token]);

  async function vote(decision: 'approve' | 'deny') {
    setBusy(true);
    const result = await call({ token, decision, comment, minutes: decision === 'approve' ? (offer ?? undefined) : undefined });
    setData((prev) => ({ ...result, request: result.request ?? prev?.request }));
    setBusy(false);
  }

  if (!data) return <p className="text-slate-500">Loading…</p>;
  const r = data.request;
  if (!r) return <p className="text-red-600">{data.error ?? 'Something went wrong.'}</p>;

  const canVote = !data.ok && !r.alreadyUsed && r.status === 'pending' && new Date(r.expiresAt) > new Date();
  const offers = [...COUNTER_OFFER_OPTIONS.filter((m) => m < r.minutes), r.minutes];
  const chosen = offer ?? r.minutes;

  return (
    <>
      <p className="text-slate-500">Hi {r.voterName},</p>
      <Card>
        <StatusPill status={r.status} />
        <p className="mt-3 text-lg">
          <b>{r.requesterName}</b> is asking for
        </p>
        <p className="text-4xl font-extrabold">{formatMinutes(r.minutes)}</p>
        {r.limitName && <p className="text-slate-500">more on “{r.limitName}”</p>}
        <p className="mt-3">{r.reason ? `“${r.reason}”` : <span className="text-slate-500">No reason given</span>}</p>
        <p className="mt-3 text-sm text-slate-500">
          Asked {relativeTime(r.createdAt)}
          {r.status === 'pending' && ` · expires ${relativeTime(r.expiresAt)}`}
        </p>
      </Card>

      {data.ok && <p className="font-semibold text-green-600">Thanks! Your answer was sent.</p>}
      {data.error && <p className="text-red-600">{data.error}</p>}

      {canVote && (
        <div className="flex flex-col gap-3">
          {offers.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {offers.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setOffer(m)}
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                    m === chosen ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {m === r.minutes ? `All ${formatMinutes(m)}` : formatMinutes(m)}
                </button>
              ))}
            </div>
          )}
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Message (optional)" maxLength={280} />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger" disabled={busy} onClick={() => vote('deny')}>
              Deny
            </Button>
            <Button variant="success" disabled={busy} onClick={() => vote('approve')}>
              {chosen < r.minutes ? `Approve ${formatMinutes(chosen)}` : 'Approve'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
