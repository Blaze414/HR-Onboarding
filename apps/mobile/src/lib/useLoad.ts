import { friendlyError } from '@snoopy/shared';
import { useCallback, useEffect, useState } from 'react';

/**
 * Small data hook: initial load, pull-to-refresh, and a readable error.
 * Screens stay declarative and never hold Supabase calls inline.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      setData(await loader());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, refreshing, error, reload: () => run(false), refresh: () => run(true) };
}
