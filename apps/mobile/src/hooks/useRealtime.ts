import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

type Table = 'extension_requests' | 'request_votes' | 'partnerships';

/**
 * Subscribe to Postgres changes on a table (RLS applies), calling `onChange`
 * for every insert/update/delete. `filter` uses PostgREST syntax, e.g. `id=eq.123`.
 */
export function useRealtime(table: Table, onChange: () => void, filter?: string) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const channel = supabase
      .channel(`rt:${table}:${filter ?? '*'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => cb.current())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter]);
}
