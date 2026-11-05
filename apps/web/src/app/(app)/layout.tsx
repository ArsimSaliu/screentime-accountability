import { displayName } from '@screentime/shared';
import Link from 'next/link';
import { Suspense } from 'react';
import { requireUser } from '@/lib/data';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <Link href="/dashboard" className="text-xl font-extrabold">
          Leash
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/partners">Partners</Link>
          <Suspense>
            <UserMenu />
          </Suspense>
        </nav>
      </header>
      {children}
    </div>
  );
}

async function UserMenu() {
  const { profile } = await requireUser({ allowNotOnboarded: true });
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-3">
      <span className="hidden text-slate-500 sm:inline">{displayName(profile)}</span>
      <button className="text-slate-500 hover:text-slate-900 dark:hover:text-white">Sign out</button>
    </form>
  );
}
