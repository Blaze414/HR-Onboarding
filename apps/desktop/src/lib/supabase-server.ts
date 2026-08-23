import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { resolveBackendUrl } from '@snoopy/shared';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

/**
 * The backend URL for the current request's host.
 *
 * This has to match what the browser resolved, because @supabase/ssr derives the
 * auth cookie's name from the URL host: a browser on the LAN writes
 * `sb-192-auth-token` while a server pinned to loopback reads `sb-127-auth-token`,
 * so the server sees no session, redirects to the sign-in page, and the loop
 * never ends. Both sides resolving the same way keeps the names in agreement.
 */
async function requestBackendUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host = (await headers()).get('host');
  return resolveBackendUrl(configured, host);
}

/** Request-scoped Supabase client. Auth is carried in cookies, not in memory. */
export const getServerSupabase = cache(async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    await requestBackendUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component — the middleware refreshes cookies instead.
          }
        },
      },
    },
  );
});
