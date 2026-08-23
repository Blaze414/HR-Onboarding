'use client';

import { createBrowserClient } from '@supabase/ssr';
import { resolveBackendUrl } from '@snoopy/shared';

/**
 * The browser client talks to the backend from whatever device has the page
 * open, which is not necessarily the machine running the stack. A configured
 * loopback URL is therefore rewritten to the host this page came from — without
 * it, opening the workspace from a phone or another laptop fails at sign in
 * while the backend is perfectly healthy.
 */
export function getBrowserSupabase() {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host = typeof window === 'undefined' ? null : window.location.hostname;
  return createBrowserClient(
    resolveBackendUrl(configured, host),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
