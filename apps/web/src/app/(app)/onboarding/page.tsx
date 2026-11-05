import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/data';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const { profile } = await requireUser({ allowNotOnboarded: true });
  if (profile.onboarded) redirect('/dashboard');
  return (
    <main className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-extrabold">Pick a username</h1>
      <p className="mt-2 mb-6 text-slate-500">Friends use it to add you as their accountability partner.</p>
      <OnboardingForm />
    </main>
  );
}
