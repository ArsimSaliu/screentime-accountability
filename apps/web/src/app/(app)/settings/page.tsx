import Link from 'next/link';
import { Card, SectionTitle } from '@/components/ui';
import { requireUser } from '@/lib/data';
import { DeleteAccount } from './delete-account';

export default async function SettingsPage() {
  const { profile, email } = await requireUser();
  return (
    <main>
      <h1 className="text-3xl font-extrabold">Settings</h1>

      <SectionTitle>Account</SectionTitle>
      <Card>
        <p className="font-semibold">{profile.display_name || `@${profile.username}`}</p>
        <p className="text-sm text-slate-500">@{profile.username}</p>
        {email && <p className="text-sm text-slate-500">{email}</p>}
      </Card>

      <p className="mt-4 text-sm">
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>
      </p>

      <SectionTitle>Danger zone</SectionTitle>
      <DeleteAccount />
    </main>
  );
}
