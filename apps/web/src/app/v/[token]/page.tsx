import { MagicVote } from './magic-vote';

export const metadata = { title: 'Approve screen time request', robots: { index: false } };

export default async function MagicVotePage({ params }: PageProps<'/v/[token]'>) {
  const { token } = await params;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <MagicVote token={token} />
    </main>
  );
}
