'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Table = 'extension_requests' | 'request_votes' | 'partnerships';

/** Re-renders the current server page whenever one of the tables changes (RLS applies). */
export function LiveRefresh({ tables, filter }: { tables: Table[]; filter?: Partial<Record<Table, string>> }) {
  const router = useRouter();
  const key = JSON.stringify({ tables, filter });

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };

    const channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: filter?.[table] }, refresh);
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router]);

  return null;
}
