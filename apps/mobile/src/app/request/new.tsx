import { formatMinutes, REQUEST_MINUTE_OPTIONS, requestFormSchema } from '@screentime/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Chips, ErrorText, Field, Screen, SectionTitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { createRequest, listMyLimits } from '../../lib/api';
import { useUserId } from '../../lib/auth';
import { friendlyError } from '../../lib/supabase';

const NO_LIMIT = 'none';

export default function NewRequest() {
  const userId = useUserId();
  const { data: limits, error: loadError } = useAsync(() => listMyLimits(userId), [userId]);
  const extendable = (limits ?? []).filter((l) => l.active && l.strictness !== 'locked');

  const [limitId, setLimitId] = useState<string>(NO_LIMIT);
  const [minutes, setMinutes] = useState<number>(15);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsed = requestFormSchema.safeParse({
      limit_id: limitId === NO_LIMIT ? null : limitId,
      minutes_requested: minutes,
      reason,
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError(null);
    try {
      const id = await createRequest({
        requesterId: userId,
        limitId: parsed.data.limit_id,
        minutes: parsed.data.minutes_requested,
        reason: parsed.data.reason,
      });
      router.replace({ pathname: '/request/[id]', params: { id } });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  const limitOptions = [NO_LIMIT, ...extendable.map((l) => l.id)];
  const limitLabel = (id: string) => (id === NO_LIMIT ? 'General' : (extendable.find((l) => l.id === id)?.name ?? '?'));

  return (
    <Screen>
      <ErrorText error={loadError} />
      <SectionTitle>Which limit?</SectionTitle>
      <Chips options={limitOptions} value={limitId} onChange={setLimitId} format={limitLabel} />

      <SectionTitle>How much more time?</SectionTitle>
      <Chips options={REQUEST_MINUTE_OPTIONS} value={minutes as 15} onChange={setMinutes} format={formatMinutes} />

      <Field
        label="Reason (your partners will see this)"
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. Finishing a work call on WhatsApp"
        maxLength={280}
        multiline
      />

      {error ? <Body style={{ color: 'red' }}>{error}</Body> : null}
      <Button title={`Ask for ${formatMinutes(minutes)}`} onPress={submit} loading={busy} />
    </Screen>
  );
}
