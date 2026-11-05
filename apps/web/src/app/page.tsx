import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-5xl font-extrabold tracking-tight">Leash</h1>
      <p className="text-lg text-slate-600 dark:text-slate-400">
        Screen time limits you set for yourself. When you really need more time, your friends approve it, from
        the app or right here on the web.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500">
          Sign in
        </Link>
        <Link href="/dashboard" className="rounded-xl border border-slate-300 px-5 py-3 font-semibold dark:border-slate-700">
          Dashboard
        </Link>
      </div>
      <Link href="/privacy" className="text-sm text-slate-500 underline">
        Privacy policy
      </Link>
    </main>
  );
}
