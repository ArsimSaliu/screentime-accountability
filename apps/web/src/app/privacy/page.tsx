import Link from 'next/link';

export const metadata = { title: 'Privacy policy · Leash' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 leading-relaxed">
      <Link href="/" className="text-sm text-slate-500">
        ← Leash
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold">Privacy policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: November 2026</p>

      <h2 className="mt-8 text-xl font-bold">What Leash does</h2>
      <p className="mt-2">
        Leash lets you set screen time limits on your own iPhone and ask friends you choose (&ldquo;partners&rdquo;)
        to approve extra time.
      </p>

      <h2 className="mt-8 text-xl font-bold">What we store</h2>
      <ul className="mt-2 list-disc pl-6">
        <li>Your email address (for sign-in codes and optional notifications).</li>
        <li>Your username, optional display name and time zone.</li>
        <li>The limits you create (name, minutes, strictness), your requests for more time, and partners&apos; votes.</li>
        <li>Your partner connections and the alerts sent to them (for example when a limit is loosened).</li>
        <li>When you last opened the app and whether Screen Time access is on.</li>
        <li>A push notification token for your device.</li>
      </ul>

      <h2 className="mt-8 text-xl font-bold">What never leaves your phone</h2>
      <p className="mt-2">
        Which apps, categories and websites you limit, and how long you use them. Apple&apos;s Screen Time system
        gives Leash only opaque tokens for these, which stay on your device. We can&apos;t see app names or usage.
      </p>

      <h2 className="mt-8 text-xl font-bold">Who can see your data</h2>
      <p className="mt-2">
        Only you and the partners you accept. Partners see your limit names and settings, your requests and their
        outcome, your streak, when you last opened the app, and alerts about changes to your limits. We don&apos;t sell
        data or use it for advertising.
      </p>

      <h2 className="mt-8 text-xl font-bold">Services we use</h2>
      <p className="mt-2">
        Supabase (database and sign-in), Expo (push notifications), Apple Push Notification service, Vercel (website
        hosting) and, if enabled, Resend (email).
      </p>

      <h2 className="mt-8 text-xl font-bold">Deleting your data</h2>
      <p className="mt-2">
        Delete your account any time in the app (Settings → Delete account) or on the website (Settings). This removes
        your profile, limits, requests, votes and partner connections. Deleting the app also removes the blocks it set.
      </p>
    </main>
  );
}
