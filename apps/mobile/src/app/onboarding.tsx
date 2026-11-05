import { usernameSchema } from '@screentime/shared';
import { useState } from 'react';
import { Body, Button, Field, Screen } from '../components/ui';
import { useAuth } from '../lib/auth';
import { friendlyError, supabase } from '../lib/supabase';

export default function Onboarding() {
  const { session, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        username: parsed.data,
        display_name: displayName.trim() || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        onboarded: true,
      })
      .eq('id', session!.user.id);
    setBusy(false);
    if (error) return setError(error.code === '23505' ? 'That username is taken' : friendlyError(error));
    await refreshProfile();
  }

  return (
    <Screen>
      <Body muted>Pick a username. Friends use it to add you as their accountability partner.</Body>
      <Field
        label="Username"
        value={username}
        onChangeText={(v) => setUsername(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="e.g. alex_k"
        error={error}
      />
      <Field label="Display name (optional)" value={displayName} onChangeText={setDisplayName} placeholder="Alex" />
      <Button title="Continue" onPress={save} loading={busy} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
