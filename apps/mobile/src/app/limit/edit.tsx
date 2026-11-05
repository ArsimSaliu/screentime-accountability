import {
  describePendingChange,
  limitFormSchema,
  relativeTime,
  STRICTNESS_INFO,
  type Limit,
  type LimitForm,
  type Strictness,
} from '@screentime/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { AppPicker } from '../../components/AppPicker';
import { useTheme } from '../../components/theme';
import { Body, Button, Card, Chips, Field, Loading, Screen, SectionTitle } from '../../components/ui';
import { cancelPendingLimitChange, deleteLimit, getLimit, listMyLimits, saveLimit } from '../../lib/api';
import { useUserId } from '../../lib/auth';
import { friendlyError } from '../../lib/supabase';
import { ScreenTime } from '../../screentime';

const STRICTNESS: Strictness[] = ['relaxed', 'standard', 'strict', 'locked'];
const MINUTE_PRESETS = [15, 30, 60, 90, 120, 180] as const;

const EMPTY: LimitForm = { name: '', kind: 'daily', minutes: 60, strictness: 'standard', approvals_required: 1 };

export default function EditLimit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const userId = useUserId();
  const t = useTheme();
  const [form, setForm] = useState<LimitForm>(EMPTY);
  const [active, setActive] = useState(true);
  const [current, setCurrent] = useState<Limit | null>(null);
  const [selection, setSelection] = useState<string | null>(() => (id ? ScreenTime.getSelection(id) : null));
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getLimit(id)
      .then((l) => {
        setCurrent(l);
        if (l) {
          setForm({
            name: l.name,
            kind: l.kind,
            minutes: l.minutes,
            strictness: l.strictness,
            approvals_required: l.approvals_required,
          });
          setActive(l.active);
        }
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof LimitForm>(key: K, value: LimitForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    const parsed = limitFormSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (ScreenTime.isAvailable && !selection) return setError('Choose which apps this limit covers');
    setBusy(true);
    try {
      const limitId = await saveLimit(userId, id ? { ...parsed.data, active } : parsed.data, id);
      if (selection) ScreenTime.saveSelection(limitId, selection);
      await ScreenTime.syncLimits(await listMyLimits(userId));

      const saved = await getLimit(limitId);
      const queued = saved && saved.pending_effective_at && saved.pending_effective_at !== current?.pending_effective_at;
      if (queued) {
        Alert.alert(
          'Change scheduled',
          `Loosening a limit takes 24 hours, and your partners have been told. Pending: ${describePendingChange(saved)}.`,
        );
      }
      router.back();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    const relaxed = current?.strictness === 'relaxed' || current?.active === false;
    Alert.alert(
      'Delete this limit?',
      relaxed ? undefined : 'It will be removed in 24 hours. Your partners will be told, and you can cancel before then.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await deleteLimit(id);
              await ScreenTime.syncLimits(await listMyLimits(userId));
              if (result === 'scheduled') Alert.alert('Deletion scheduled', 'This limit stays active for 24 more hours.');
              router.back();
            } catch (e) {
              setError(friendlyError(e));
            }
          },
        },
      ],
    );
  }

  async function cancelPending() {
    if (!id) return;
    try {
      await cancelPendingLimitChange(id);
      setCurrent(await getLimit(id));
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      {current?.pending_change && current.pending_effective_at ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>Scheduled change</Body>
          <Body muted>
            {describePendingChange(current)} · takes effect {relativeTime(current.pending_effective_at)}
          </Body>
          <Button title="Cancel scheduled change" variant="secondary" onPress={cancelPending} />
        </Card>
      ) : null}
      {current && current.strictness !== 'relaxed' && (
        <Body muted>Tightening applies now. Loosening, pausing or deleting takes 24 hours.</Body>
      )}
      <Field
        label="Name"
        value={form.name}
        onChangeText={(v) => set('name', v)}
        placeholder="e.g. Social media"
        error={error}
      />

      <SectionTitle>Apps</SectionTitle>
      <AppPicker value={selection} onChange={setSelection} />

      <SectionTitle>Type</SectionTitle>
      <Chips
        options={['daily', 'session'] as const}
        value={form.kind}
        onChange={(v) => set('kind', v)}
        format={(v) => (v === 'daily' ? 'Daily total' : 'Per session')}
      />
      {form.kind === 'session' && (
        <Body muted>Per-session blocking isn’t supported by iOS yet. This limit is saved but won’t block apps.</Body>
      )}

      <SectionTitle>Minutes</SectionTitle>
      <Chips options={MINUTE_PRESETS} value={form.minutes as never} onChange={(v) => set('minutes', v)} />
      <Field
        label="Custom"
        value={String(form.minutes)}
        onChangeText={(v) => set('minutes', Number(v.replace(/\D/g, '')) || 0)}
        keyboardType="number-pad"
      />

      <SectionTitle>Strictness</SectionTitle>
      <Chips
        options={STRICTNESS}
        value={form.strictness}
        onChange={(v) => set('strictness', v)}
        format={(v) => STRICTNESS_INFO[v].label}
      />
      <Body muted>{STRICTNESS_INFO[form.strictness].description}</Body>

      {form.strictness === 'standard' && (
        <>
          <SectionTitle>Approvals needed</SectionTitle>
          <Chips options={[1, 2, 3] as const} value={form.approvals_required as 1} onChange={(v) => set('approvals_required', v)} />
          <Body muted>Capped at however many partners you have.</Body>
        </>
      )}

      {id && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Body>Active</Body>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: t.primary }} />
        </View>
      )}

      <Button title={id ? 'Save' : 'Create limit'} onPress={save} loading={busy} />
      {id && <Button title="Delete" variant="danger" onPress={remove} />}
    </Screen>
  );
}
