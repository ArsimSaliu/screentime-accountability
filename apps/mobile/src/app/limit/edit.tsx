import { limitFormSchema, STRICTNESS_INFO, type LimitForm, type Strictness } from '@screentime/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { useTheme } from '../../components/theme';
import { Body, Button, Chips, Field, Loading, Screen, SectionTitle } from '../../components/ui';
import { deleteLimit, getLimit, saveLimit } from '../../lib/api';
import { useUserId } from '../../lib/auth';
import { friendlyError } from '../../lib/supabase';

const STRICTNESS: Strictness[] = ['relaxed', 'standard', 'strict', 'locked'];
const MINUTE_PRESETS = [15, 30, 60, 90, 120, 180] as const;

const EMPTY: LimitForm = { name: '', kind: 'daily', minutes: 60, strictness: 'standard', approvals_required: 1 };

export default function EditLimit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const userId = useUserId();
  const t = useTheme();
  const [form, setForm] = useState<LimitForm>(EMPTY);
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getLimit(id)
      .then((l) => {
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
    setBusy(true);
    try {
      await saveLimit(userId, { ...parsed.data, ...(id ? { active } : {}) } as LimitForm, id);
      router.back();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert('Delete this limit?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteLimit(id).then(() => router.back(), (e) => setError(friendlyError(e))),
      },
    ]);
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <Field
        label="Name"
        value={form.name}
        onChangeText={(v) => set('name', v)}
        placeholder="e.g. Social media"
        error={error}
      />

      <SectionTitle>Type</SectionTitle>
      <Chips
        options={['daily', 'session'] as const}
        value={form.kind}
        onChange={(v) => set('kind', v)}
        format={(v) => (v === 'daily' ? 'Daily total' : 'Per session')}
      />

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
