import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams;
  const safeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-24">
      <div>
        <h1 className="text-3xl font-extrabold">Sign in</h1>
        <p className="mt-2 text-slate-500">
          We&apos;ll email you a one-time code. Use the same email you use in the app.
        </p>
      </div>
      <LoginForm next={safeNext} />
    </main>
  );
}
