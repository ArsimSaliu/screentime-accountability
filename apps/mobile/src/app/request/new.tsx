import {
  EMERGENCY_MAX_MINUTES,
  formatMinutes,
  REASON_TEMPLATES,
  REQUEST_MINUTE_OPTIONS,
  requestFormSchema,
} from '@screentime/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Body, Button, Card, Chips, ErrorText, Field, Screen, SectionTitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { createRequest, emergencyUnlock, listMyLimits } from '../../lib/api';
import { useUserId } from '../../lib/auth';
import { haptic } from '../../lib/haptics';
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
      haptic.success();
      router.replace({ pathname: '/request/[id]', params: { id } });
    } catch (e) {
      haptic.error();
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  function emergency() {
    if (reason.trim().length < 3) {
      return setError('Write a short reason above first. Your partners will see it.');
    }
    Alert.alert(
      `Emergency unlock (${EMERGENCY_MAX_MINUTES} min)?`,
      'This skips approval. Every partner is alerted immediately, and you can only do it once every 24 hours.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock now',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              const id = await emergencyUnlock(
                EMERGENCY_MAX_MINUTES,
                reason.trim(),
                limitId === NO_LIMIT ? null : limitId,
              );
              router.replace({ pathname: '/request/[id]', params: { id } });
            } catch (e) {
              setError(friendlyError(e));
              setBusy(false);
            }
          },
        },
      ],
    );
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

      <SectionTitle>Why?</SectionTitle>
      <Chips
        options={['', ...REASON_TEMPLATES]}
        value={(REASON_TEMPLATES as readonly string[]).includes(reason) ? reason : ''}
        onChange={(r) => {
          haptic.tap();
          setReason(r);
        }}
        format={(r) => r || 'Other'}
      />
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

      <SectionTitle>Real emergency?</SectionTitle>
      <Card>
        <Body muted>
          Unlock for {EMERGENCY_MAX_MINUTES} min without waiting. Once per 24 h, and all partners are alerted.
        </Body>
        <Button title="Emergency unlock" variant="danger" onPress={emergency} disabled={busy} />
      </Card>
    </Screen>
  );
}
