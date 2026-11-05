import { emailSchema, otpSchema } from '@screentime/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Body, Button, Field, Screen, Title } from '../components/ui';
import { friendlyError, supabase } from '../lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setStep('code');
  }

  async function verify() {
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: emailSchema.parse(email),
      token: parsed.data,
      type: 'email',
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    // On success the root layout's auth guard swaps screens automatically.
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ height: 80 }} />
        <Title>Leash</Title>
        <Body muted>
          Screen time limits you set yourself, with friends who can approve extra time when you really need it.
        </Body>

        {step === 'email' ? (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              error={error}
              onSubmitEditing={sendCode}
            />
            <Button title="Send code" onPress={sendCode} loading={busy} />
          </>
        ) : (
          <>
            <Body muted>We emailed a code to {email}.</Body>
            <Field
              label="Code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="123456"
              error={error}
              onSubmitEditing={verify}
            />
            <Button title="Sign in" onPress={verify} loading={busy} />
            <Button
              title="Use a different email"
              variant="secondary"
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
