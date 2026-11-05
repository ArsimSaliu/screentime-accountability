'use client';

import { COUNTER_OFFER_OPTIONS, formatMinutes } from '@screentime/shared';
import { useActionState, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { voteAction } from '@/lib/actions';

export function VotePanel({ requestId, requested }: { requestId: string; requested: number }) {
  const [state, action, pending] = useActionState(voteAction, undefined);
  const offers = [...COUNTER_OFFER_OPTIONS.filter((m) => m < requested), requested];
  const [offer, setOffer] = useState(requested);

  return (
    <Card>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="minutes" value={offer} />
        {offers.length > 1 && (
          <div>
            <p className="mb-2 text-sm text-slate-500">Approve how much?</p>
            <div className="flex flex-wrap gap-2">
              {offers.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setOffer(m)}
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                    m === offer ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {m === requested ? `All ${formatMinutes(m)}` : formatMinutes(m)}
                </button>
              ))}
            </div>
          </div>
        )}
        <Input name="comment" placeholder="Message (optional), e.g. OK, but then bed!" maxLength={280} />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Button name="decision" value="deny" variant="danger" disabled={pending}>
            Deny
          </Button>
          <Button name="decision" value="approve" variant="success" disabled={pending}>
            {offer < requested ? `Approve ${formatMinutes(offer)}` : 'Approve'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
