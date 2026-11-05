import { displayName, type InviteLinkInfo } from '@screentime/shared';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { AcceptInvite } from './accept-invite';

export const metadata = { title: 'Partner invite · Leash', robots: { index: false } };

export default async function JoinPage({ params }: PageProps<'/join/[code]'>) {
  const { code } = await params;
  const supabase = await createClient();
  const [{ data: info }, { data: claims }] = await Promise.all([
    supabase.rpc('invite_link_info', { p_code: code }),
    supabase.auth.getClaims(),
  ]);
  const invite = info as InviteLinkInfo;
  const signedIn = !!claims?.claims;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-extrabold">Leash</h1>
      {!invite || invite.expired ? (
        <Card>
          <p className="font-semibold">This invite link is invalid or has expired.</p>
          <p className="mt-1 text-slate-500">Ask your friend to send you a new one.</p>
        </Card>
      ) : (
        <Card>
          <p className="text-2xl font-extrabold">{displayName(invite)}</p>
          <p className="mt-2">
            wants you as an <b>accountability partner</b>. When they hit a screen time limit and ask for more
            time, you approve or deny it from the app, this website, or a one-tap email link.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            {signedIn ? (
              <AcceptInvite code={code} />
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(`/join/${code}`)}`}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 font-semibold text-white hover:bg-indigo-500"
              >
                Sign in to accept
              </Link>
            )}
            <a
              href={`leash://join/${code}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 font-semibold dark:border-slate-700"
            >
              Open in the iPhone app
            </a>
          </div>
        </Card>
      )}
    </main>
  );
}
