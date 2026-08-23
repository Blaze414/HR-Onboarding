import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  /** How long a single request may hang before it is treated as unreachable. */
  timeoutMs?: number;
  url: string;
  anonKey: string;
  /** Platform-specific session storage (AsyncStorage on mobile, cookies/localStorage on web). */
  storage?: any;
  detectSessionInUrl?: boolean;
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  if (!config.url || !config.anonKey) {
    throw new Error(
      'Supabase is not configured. Set the Supabase URL and anon key in your environment file.',
    );
  }
  return createClient(config.url, config.anonKey, {
    auth: {
      storage: config.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
    },
    global: {
      /*
       * A request to an unreachable host does not fail — it hangs until the OS
       * gives up, which can be well over a minute. On a phone that reads as a
       * sign-in button that spins forever with nothing to act on. A deadline
       * turns silence into an error the interface can actually show.
       */
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(config.timeoutMs ?? 15_000);
        // Preserve any caller signal; supabase-js aborts its own requests.
        const signal = init?.signal
          ? AbortSignal.any([init.signal, timeout])
          : timeout;
        return fetch(input, { ...init, signal });
      },
    },
  });
}

export type Db = SupabaseClient;
