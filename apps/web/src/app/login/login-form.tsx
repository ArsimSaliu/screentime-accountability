'use client';

import { emailSchema, otpSchema } from '@screentime/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setStep('code');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({
      email: emailSchema.parse(email),
      token: parsed.data,
      type: 'email',
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    router.replace(next);
    router.refresh();
  }

  return step === 'email' ? (
    <form onSubmit={sendCode} className="flex flex-col gap-3">
      <Input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button disabled={busy}>{busy ? 'Sending…' : 'Send code'}</Button>
    </form>
  ) : (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">Code sent to {email}</p>
      <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      <Button type="button" variant="secondary" onClick={() => setStep('email')}>
        Use a different email
      </Button>
    </form>
  );
}
